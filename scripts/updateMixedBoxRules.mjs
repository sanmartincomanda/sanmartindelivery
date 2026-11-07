import { readFile, writeFile } from 'node:fs/promises';
import { catalogBoxValidation, catalogComponentRules, orderBoxValidation, orderBoxLineKeyRules } from './mixedBoxRuleExpressions.mjs';

// Generate only the existing box-validation nodes; never change write grants.
const file = new URL('../firebase.database.rules.json', import.meta.url);
const rules = JSON.parse(await readFile(file, 'utf8'));
rules.rules.storeCatalog.$productId['.validate'] = catalogBoxValidation;
rules.rules.storeCatalog.$productId.boxSale.components = catalogComponentRules;
rules.rules.orders.$orderId.items.$itemId['.validate'] = orderBoxValidation;
rules.rules.orders.$orderId.items.$itemId.ventaPorCaja ??= {};
rules.rules.orders.$orderId.items.$itemId.ventaPorCaja.lineKeys = orderBoxLineKeyRules;
await writeFile(file, JSON.stringify(rules, null, 2) + '\n');
console.log('Generated local box validations. No deployment or database writes.');
