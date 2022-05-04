import * as BRTHelper from './brt-helper.js'
import * as Utils from '../core/utils.js'
import { MODULE , BRTCONFIG } from './config.js'
import { addRollModeToChatData } from '../core/utils.js'

export class BRTBuilder {
  constructor (tableEntity) {
    this.table = tableEntity
  }

  /**
     *
     * @param {*} rollsAmount
     * @returns {array} results
     */
  async betterRoll (rollsAmount = undefined) {
    this.mainRoll = undefined;
    rollsAmount = rollsAmount || await BRTHelper.rollsAmount(this.table);
    this.results = await this.rollManyOnTable(rollsAmount, this.table);
    return this.results;
  }

  /**
     *
     * @param {array} results
     */
  async createChatCard (results, rollMode = null) {

    let msgData = { roll: this.mainRoll, messageData: {}};
    if (rollMode) addRollModeToChatData(msgData.messageData, rollMode);
    await this.table.toMessage(results, msgData);

    results.forEach(element => {
      if (element.data.collection == "Macro"){
        const macro = game.macros.find(m => m.name === element.data.text); 
        macro.execute();
      }
      console.log(element)
    });
  }

  /**
     *
     * @param {number} amount
     * @param {RollTable} table
     * @param {object} options
     *
     * @returns {array}
     */
  async rollManyOnTable (amount, table, { _depth = 0 } = {}) {
    const maxRecursions = 5;
    let msg = '';
    // Prevent infinite recursion
    if (_depth > maxRecursions) {
      let msg = game.i18n.format("BRT.Strings.Warnings.MaxRecursion", { maxRecursions: maxRecursions, tableId: table.id });
      throw new Error(MODULE.ns + " | " + msg);
    }

    let drawnResults = [];

    while (amount > 0) {
      let resultToDraw = amount;
      /** if we draw without replacement we need to reset the table once all entries are drawn */
      if (!table.data.replacement) {
        const resultsLeft = table.data.results.reduce(function (n, r) { return n + (!r.drawn) }, 0)

        if (resultsLeft === 0) {
          await table.reset();
          continue;
        }

        resultToDraw = Math.min(resultsLeft, amount);
      }

      if (!table.data.formula) {
        let msg = game.i18n.format('BRT.RollTable.NoFormula', { name: table.name });
        ui.notifications.error(MODULE.ns + ' | ' + msg);
        return;
      }

      const draw = await table.drawMany(resultToDraw, { displayChat: false, recursive: false });
      if (!this.mainRoll) {
        this.mainRoll = draw.roll;
      }

      for (const entry of draw.results) {
        const formulaAmount = getProperty(entry, `data.flags.${BRTCONFIG.NAMESPACE}.${BRTCONFIG.RESULTS_FORMULA_KEY}.formula`) || '';
        const entryAmount = await BRTHelper.tryRoll(formulaAmount);

        let innerTable;
        if (entry.data.type === CONST.TABLE_RESULT_TYPES.ENTITY && entry.data.collection === 'RollTable') {
          innerTable = game.tables.get(entry.data.resultId);
        } else if (entry.data.type === CONST.TABLE_RESULT_TYPES.COMPENDIUM) {
          const entityInCompendium = await Utils.findInCompendiumByName(entry.data.collection, entry.data.text);
          if ((entityInCompendium !== undefined) && entityInCompendium.documentName === 'RollTable') {
            innerTable = entityInCompendium;
          }
        }

        if (innerTable) {
          const innerResults = await this.rollManyOnTable(entryAmount, innerTable, { _depth: _depth + 1 });
          drawnResults = drawnResults.concat(innerResults);
        } else {
          for (let i = 0; i < entryAmount; i++) {
            drawnResults.push(entry);
          }
        }
      }
      amount -= resultToDraw;
    }

    return drawnResults;
  }
}
