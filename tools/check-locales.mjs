import { EN, ZH } from '../src/i18n.js';
import { GENERATED_LOCALES } from '../src/locales.generated.js';

const expectedKeys = Object.keys(EN);
const dictionaries = { en: EN, 'zh-CN': ZH, ...GENERATED_LOCALES };
const forbidden = [
  '|||HBSEP|||', '__HBVAR', '�',
  'DEFEAT THE MARK', 'ELITE INBOUND', 'por ejecución', '実行ごと', '실행당',
  'FINALIZAR EJECUCIÓN', 'FIM DA EXECUÇÃO',
];

function variables(value) {
  return [...String(value).matchAll(/\{[^}]+\}/g)].map(match => match[0]).sort().join('|');
}

const errors = [];
for (const [locale, dictionary] of Object.entries(dictionaries)) {
  const keys = Object.keys(dictionary);
  for (const key of expectedKeys) {
    if (!(key in dictionary)) errors.push(`${locale}: missing ${key}`);
    else if (variables(dictionary[key]) !== variables(EN[key])) errors.push(`${locale}: placeholders differ for ${key}`);
  }
  for (const key of keys) if (!(key in EN)) errors.push(`${locale}: unexpected ${key}`);
  if (locale === 'en') continue;
  for (const [key, value] of Object.entries(dictionary)) {
    for (const pattern of forbidden) {
      if (value.includes(pattern)) errors.push(`${locale}: ${key} contains forbidden translation "${pattern}"`);
    }
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(`i18n OK: ${Object.keys(dictionaries).length} locales, ${expectedKeys.length} keys each, placeholders intact.`);
