import { createHash } from 'node:crypto';

export const NFE_XML_NS = 'http://www.portalfiscal.inf.br/nfe';
export const NFE_VERSION = '4.00';

export const NFE_UF_CODES = {
  AC: '12',
  AL: '27',
  AP: '16',
  AM: '13',
  BA: '29',
  CE: '23',
  DF: '53',
  ES: '32',
  GO: '52',
  MA: '21',
  MT: '51',
  MS: '50',
  MG: '31',
  PA: '15',
  PB: '25',
  PR: '41',
  PE: '26',
  PI: '22',
  RJ: '33',
  RN: '24',
  RS: '43',
  RO: '11',
  RR: '14',
  SC: '42',
  SP: '35',
  SE: '28',
  TO: '17',
};

export function onlyDigits(value, maxLength = 64) {
  return String(value ?? '').replace(/\D+/g, '').slice(0, maxLength);
}

export function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const SUPPORTED_SIMPLE_NATIONAL_CSOSN = new Set(['102', '103', '300', '400', '500']);

const ICMSSN500_OPTIONAL_GROUPS = [
  {
    label: 'ICMS ST retido anteriormente',
    fields: [
      ['vBCSTRet', 2, true],
      ['pST', 4, true],
      ['vICMSSubstituto', 2, false],
      ['vICMSSTRet', 2, true],
    ],
  },
  {
    label: 'FCP ST retido anteriormente',
    fields: [
      ['vBCFCPSTRet', 2, true],
      ['pFCPSTRet', 4, true],
      ['vFCPSTRet', 2, true],
    ],
  },
  {
    label: 'ICMS efetivo',
    fields: [
      ['pRedBCEfet', 4, true],
      ['vBCEfet', 2, true],
      ['pICMSEfet', 4, true],
      ['vICMSEfet', 2, true],
    ],
  },
];

function hasFiscalValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function toFiscalNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const normalized = String(value ?? '').trim().replace(',', '.');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatRequiredNfeNumber(value, decimals, fieldName) {
  const parsed = toFiscalNumber(value);
  if (parsed === null || parsed < 0) {
    throw new Error(`Valor fiscal invalido para ${fieldName}.`);
  }
  const formatted = parsed.toFixed(decimals);
  const maxIntegerDigits = String(fieldName || '').startsWith('p') ? 3 : 13;
  const [integerPart] = formatted.split('.');
  if (integerPart.length > maxIntegerDigits) {
    throw new Error(`Valor fiscal fora do limite do XML para ${fieldName}.`);
  }
  return formatted;
}

function buildOptionalNfeNumberTag(item, fieldName, decimals) {
  const value = item?.[fieldName];
  if (!hasFiscalValue(value)) return '';
  return `<${fieldName}>${formatRequiredNfeNumber(value, decimals, fieldName)}</${fieldName}>`;
}

function buildIcmssn500OptionalGroups(item) {
  const tags = [];
  for (const group of ICMSSN500_OPTIONAL_GROUPS) {
    const hasAnyValue = group.fields.some(([fieldName]) => hasFiscalValue(item?.[fieldName]));
    if (!hasAnyValue) continue;

    const missingFields = group.fields
      .filter(([, , required]) => required)
      .map(([fieldName]) => fieldName)
      .filter((fieldName) => !hasFiscalValue(item?.[fieldName]));
    if (missingFields.length > 0) {
      throw new Error(
        `Bloco ${group.label} incompleto no CSOSN 500; informe ${missingFields.join(', ')}.`,
      );
    }

    for (const [fieldName, decimals] of group.fields) {
      const tag = buildOptionalNfeNumberTag(item, fieldName, decimals);
      if (tag) tags.push(tag);
    }
  }
  return tags;
}

function normalizeSimpleNationalCsosn(value) {
  const raw = hasFiscalValue(value) ? String(value).trim() : '102';
  const digits = raw.replace(/\D+/g, '');
  if (!/^\d{3}$/.test(digits) || !SUPPORTED_SIMPLE_NATIONAL_CSOSN.has(digits)) {
    throw new Error(`CSOSN nao suportado para emissao: ${raw || '(vazio)'}.`);
  }
  return digits;
}

function normalizeIcmsOrigin(value) {
  const raw = hasFiscalValue(value) ? String(value).trim() : '0';
  if (!/^[0-8]$/.test(raw)) throw new Error(`Origem ICMS invalida: ${raw || '(vazia)'}.`);
  return raw;
}

export function sumNfeFcpStRetained(items = []) {
  const list = Array.isArray(items) ? items : [];
  return Number(list
    .reduce((sum, item) => sum + (toFiscalNumber(item?.vFCPSTRet) || 0), 0)
    .toFixed(2));
}

/**
 * Gera exclusivamente o grupo ICMS do item.
 *
 * Para optantes do Simples Nacional, os CSOSN 102, 103, 300 e 400
 * compartilham o grupo ICMSSN102, mas preservam o CSOSN informado.
 * O CSOSN 500 usa ICMSSN500 e seus valores de ST somente são emitidos
 * quando vierem explicitamente no item.
 */
export function buildNfeIcmsXml(item = {}, fiscal = {}) {
  const crt = String(fiscal?.crt ?? '').trim();
  const cst = String(item?.cst ?? '').trim();
  const useSimpleNationalGroup = crt === '1' || crt === '4' || !cst;

  if (useSimpleNationalGroup) {
    const csosn = normalizeSimpleNationalCsosn(item?.csosn);
    const origin = normalizeIcmsOrigin(item?.origin);

    if (csosn !== '500') {
      return `
      <ICMS>
        <ICMSSN102>
          <orig>${xmlEscape(origin)}</orig>
          <CSOSN>${xmlEscape(csosn)}</CSOSN>
        </ICMSSN102>
      </ICMS>`;
    }

    const optionalFields = buildIcmssn500OptionalGroups(item)
      .map((tag) => `          ${tag}`)
      .join('\n');
    return `
      <ICMS>
        <ICMSSN500>
          <orig>${xmlEscape(origin)}</orig>
          <CSOSN>500</CSOSN>${optionalFields ? `\n${optionalFields}` : ''}
        </ICMSSN500>
      </ICMS>`;
  }

  if (cst && cst !== '00') {
    throw new Error(`CST ${cst} nao suportado pelo grupo ICMS00.`);
  }
  const base = Math.round((toFiscalNumber(item?.subtotal) || 0) * 100) / 100;
  const rate = Math.round((toFiscalNumber(item?.aliquotaIcms) || 0) * 100) / 100;
  const icms = Math.round((base * (rate / 100)) * 100) / 100;
  return `
    <ICMS>
      <ICMS00>
        <orig>${xmlEscape(normalizeIcmsOrigin(item?.origin))}</orig>
        <CST>${xmlEscape(cst || '00')}</CST>
        <modBC>3</modBC>
        <vBC>${formatRequiredNfeNumber(base, 2, 'vBC')}</vBC>
        <pICMS>${formatRequiredNfeNumber(rate, 2, 'pICMS')}</pICMS>
        <vICMS>${formatRequiredNfeNumber(icms, 2, 'vICMS')}</vICMS>
      </ICMS00>
    </ICMS>`;
}

export function normalizeFiscalEnvironment(value) {
  return String(value || '').trim().toLowerCase() === 'producao' ? 'producao' : 'homologacao';
}

export function normalizeFiscalDocumentType(value, fallback = 'nfce') {
  const raw = String(value || '').trim().toLowerCase().replace(/[^a-z]/g, '');
  if (raw === 'nfe') return 'nfe';
  return fallback === 'nfe' ? 'nfe' : 'nfce';
}

export function shouldExcludeThirdPartyDelivery(fiscal = {}) {
  return String(fiscal?.deliveryFiscalTreatment || '').trim().toLowerCase() === 'third_party_excluded';
}

export function shouldIncludeNfePaymentIntegrationGroup(paymentCode) {
  return ['03', '04', '17'].includes(String(paymentCode || '').trim());
}

export function getNfePaymentCode(method) {
  const normalized = String(method || '').trim().toLowerCase();
  if (normalized === 'dinheiro') return '01';
  if (normalized === 'cartao_debito' || normalized === 'debito') return '04';
  if (normalized === 'cartao' || normalized === 'cartao_credito' || normalized === 'credito') return '03';
  if (normalized === 'pix') return '17';
  if (normalized === 'voucher' || normalized === 'vale') return '10';
  return '99';
}

export function buildNfePaymentDetailsXml(parts = []) {
  if (!Array.isArray(parts) || parts.length < 1 || parts.length > 2) {
    throw new Error('Informe uma ou duas formas de pagamento na nota.');
  }
  return parts.map((part) => {
    const amountCents = Number.parseInt(String(part?.amountCents ?? ''), 10);
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      throw new Error('Valor de pagamento invalido na nota.');
    }
    const paymentCode = getNfePaymentCode(part?.method);
    const cardXml = shouldIncludeNfePaymentIntegrationGroup(paymentCode)
      ? '<card><tpIntegra>2</tpIntegra></card>'
      : '';
    return `
      <detPag>
        <indPag>0</indPag>
        <tPag>${paymentCode}</tPag>
        <vPag>${(amountCents / 100).toFixed(2)}</vPag>
        ${cardXml}
      </detPag>`;
  }).join('');
}

export function isNfceHomeDeliveryOrder(orderType) {
  const type = String(orderType || '').trim().toLowerCase();
  return type.includes('entrega') || type.includes('delivery');
}

export function normalizeNfceOperationType(value, fallback = 'retirada') {
  const type = String(value || '').trim().toLowerCase();
  if (type.includes('entrega') || type.includes('delivery')) return 'entrega';
  if (type.includes('consumo') || type === 'local') return 'consumo_local';
  if (type.includes('retirada') || type.includes('pickup') || type.includes('balcao')) return 'retirada';
  return normalizeNfceOperationType(fallback, 'retirada');
}

export function shouldRefreshNfeIssuedAtForRetry(status) {
  return ['rejected', 'error'].includes(String(status || '').trim().toLowerCase());
}

function fiscalEnvironmentObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function scopedFiscalValue(scoped, legacy, key, fallback = '') {
  if (Object.hasOwn(scoped, key)) return scoped[key];
  return legacy ? legacy[key] : fallback;
}

export function getFiscalEnvironmentConfig(fiscal = {}, environment = fiscal?.environment) {
  const safeFiscal = fiscalEnvironmentObject(fiscal);
  const safeEnvironment = normalizeFiscalEnvironment(environment);
  const environments = fiscalEnvironmentObject(safeFiscal.environments);
  const scoped = fiscalEnvironmentObject(environments[safeEnvironment]);
  const legacy = normalizeFiscalEnvironment(safeFiscal.environment) === safeEnvironment
    ? safeFiscal
    : null;

  return {
    environment: safeEnvironment,
    cscId: String(scopedFiscalValue(scoped, legacy, 'cscId', '') ?? '').trim(),
    csc: String(scopedFiscalValue(scoped, legacy, 'csc', '') ?? '').trim(),
    seriesNfce: onlyDigits(scopedFiscalValue(scoped, legacy, 'seriesNfce', '1'), 3) || '1',
    nextNumberNfce: onlyDigits(scopedFiscalValue(scoped, legacy, 'nextNumberNfce', ''), 9),
    seriesNfe: onlyDigits(scopedFiscalValue(scoped, legacy, 'seriesNfe', '1'), 3) || '1',
    nextNumberNfe: onlyDigits(scopedFiscalValue(scoped, legacy, 'nextNumberNfe', ''), 9),
    numberingConfirmed: safeEnvironment === 'homologacao'
      ? true
      : Boolean(scopedFiscalValue(scoped, legacy, 'numberingConfirmed', false)),
  };
}

export function updateFiscalEnvironmentConfig(fiscal = {}, environment, patch = {}) {
  const safeFiscal = fiscalEnvironmentObject(fiscal);
  const safeEnvironment = normalizeFiscalEnvironment(environment);
  const environments = fiscalEnvironmentObject(safeFiscal.environments);
  const current = fiscalEnvironmentObject(environments[safeEnvironment]);
  const safePatch = fiscalEnvironmentObject(patch);
  return {
    ...safeFiscal,
    environments: {
      ...environments,
      [safeEnvironment]: {
        ...current,
        ...safePatch,
      },
    },
  };
}

export function validateExplicitFiscalProductProfile(product = {}, options = {}) {
  const safeProduct = fiscalEnvironmentObject(product);
  const crt = String(options?.crt ?? '1').trim();
  const environment = normalizeFiscalEnvironment(options?.environment);
  const errors = [];
  const missing = [];

  const requireField = (key, label, predicate) => {
    const value = safeProduct[key];
    if (value === null || value === undefined || String(value).trim() === '') {
      missing.push(key);
      errors.push(`${label} nao informado.`);
      return;
    }
    if (!predicate(value)) errors.push(`${label} invalido.`);
  };

  requireField('ncm', 'NCM', (value) => /^\d{8}$/.test(onlyDigits(value, 8)));
  requireField('cfop', 'CFOP', (value) => /^\d{4}$/.test(onlyDigits(value, 4)));
  requireField('origin', 'Origem ICMS', (value) => /^[0-8]$/.test(String(value).trim()));
  requireField('unit', 'Unidade comercial', (value) => {
    const unit = String(value).trim();
    return unit.length >= 1 && unit.length <= 6;
  });
  requireField('pisCst', 'CST PIS', (value) => /^\d{2}$/.test(onlyDigits(value, 2)));
  requireField('cofinsCst', 'CST COFINS', (value) => /^\d{2}$/.test(onlyDigits(value, 2)));

  if (crt === '1' || crt === '4') {
    requireField('csosn', 'CSOSN', (value) => {
      const csosn = onlyDigits(value, 3);
      return csosn.length === 3 && SUPPORTED_SIMPLE_NATIONAL_CSOSN.has(csosn);
    });
  } else {
    requireField('cst', 'CST ICMS', (value) => /^\d{2}$/.test(onlyDigits(value, 2)));
  }

  if (safeProduct.fiscalEmissionBlocked === true) {
    errors.push('Emissao fiscal bloqueada para este item.');
  }
  if (environment === 'producao' && safeProduct.fiscalReviewRequired === true) {
    errors.push('Perfil fiscal provisorio; exige confirmacao do contador antes da producao.');
  }

  return {
    ok: errors.length === 0,
    errors,
    missing: [...new Set(missing)],
  };
}

export function buildNfeIdeConsumerIndicatorsXml(presenceIndicator) {
  const indPres = String(presenceIndicator ?? '').trim();
  if (!/^\d$/.test(indPres)) {
    throw new Error('Indicador de presenca invalido para o XML da NF-e.');
  }
  return `<indPres>${xmlEscape(indPres)}</indPres>
        <indIntermed>0</indIntermed>`;
}

export function getNfeUfCode(uf) {
  return NFE_UF_CODES[String(uf || '').trim().toUpperCase()] || '';
}

export function getDatePartsInTimeZone(value = new Date(), timeZone = 'America/Sao_Paulo') {
  const date = value instanceof Date ? value : new Date(String(value || ''));
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(safeDate);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: byType.year,
    month: byType.month,
    day: byType.day,
    hour: byType.hour === '24' ? '00' : byType.hour,
    minute: byType.minute,
    second: byType.second,
  };
}

export function getNfeYearMonth(value = new Date(), timeZone = 'America/Sao_Paulo') {
  const parts = getDatePartsInTimeZone(value, timeZone);
  return `${String(parts.year).slice(-2)}${parts.month}`;
}

export function computeNfeAccessKeyDigit(key43) {
  const digits = onlyDigits(key43, 43);
  if (digits.length !== 43) throw new Error('Chave de acesso base invalida.');
  let weight = 2;
  let sum = 0;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    sum += Number(digits[index]) * weight;
    weight += 1;
    if (weight > 9) weight = 2;
  }
  const mod = sum % 11;
  const digit = 11 - mod;
  return digit >= 10 ? '0' : String(digit);
}

export function buildNfeAccessKey({
  uf,
  issuedAt,
  cnpj,
  model,
  series,
  number,
  emissionType = '1',
  numericCode = '',
  timeZone = 'America/Sao_Paulo',
}) {
  const cUf = getNfeUfCode(uf);
  if (!cUf) throw new Error('UF invalida para gerar chave de acesso.');
  const aamm = getNfeYearMonth(issuedAt, timeZone);
  const cnpjDigits = onlyDigits(cnpj, 14);
  if (cnpjDigits.length !== 14) throw new Error('CNPJ do emitente invalido.');
  const modelDigits = onlyDigits(model, 2).padStart(2, '0');
  const seriesDigits = onlyDigits(series, 3).padStart(3, '0');
  const numberDigits = onlyDigits(number, 9).padStart(9, '0');
  const safeEmissionType = onlyDigits(emissionType, 1) || '1';
  const cNf = onlyDigits(numericCode, 8).padStart(8, '0');
  const key43 = `${cUf}${aamm}${cnpjDigits}${modelDigits}${seriesDigits}${numberDigits}${safeEmissionType}${cNf}`;
  return `${key43}${computeNfeAccessKeyDigit(key43)}`;
}

export function buildNfceQrCodeUrl({ accessKey, environment, cscId, csc, qrCodeBaseUrl }) {
  const safeAccessKey = onlyDigits(accessKey, 44);
  if (safeAccessKey.length !== 44) throw new Error('Chave NFC-e invalida para QR Code.');
  const tpAmb = normalizeFiscalEnvironment(environment) === 'producao' ? '1' : '2';
  const safeCscId = String(cscId || '').trim();
  const safeCsc = String(csc || '').trim();
  if (!safeCscId || !safeCsc) throw new Error('ID CSC/CSC obrigatorios para gerar QR Code NFC-e.');
  const payload = `${safeAccessKey}|2|${tpAmb}|${safeCscId}`;
  const hash = createHash('sha1').update(`${payload}${safeCsc}`, 'utf8').digest('hex').toUpperCase();
  return `${String(qrCodeBaseUrl || '').trim()}?p=${payload}|${hash}`;
}

export function buildNfeStatusServiceSoap({ uf, environment, version = NFE_VERSION }) {
  const cUf = getNfeUfCode(uf);
  if (!cUf) throw new Error('UF invalida para consulta de status.');
  const tpAmb = normalizeFiscalEnvironment(environment) === 'producao' ? '1' : '2';
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDadosMsg xmlns="${NFE_XML_NS}/wsdl/NFeStatusServico4">
      <consStatServ xmlns="${NFE_XML_NS}" versao="${xmlEscape(version)}">
        <tpAmb>${tpAmb}</tpAmb>
        <cUF>${cUf}</cUF>
        <xServ>STATUS</xServ>
      </consStatServ>
    </nfeDadosMsg>
  </soap12:Body>
</soap12:Envelope>`;
}

export function buildNfeAuthorizationSoap(signedNfeXml, lotId, version = NFE_VERSION) {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDadosMsg xmlns="${NFE_XML_NS}/wsdl/NFeAutorizacao4">
      <enviNFe xmlns="${NFE_XML_NS}" versao="${xmlEscape(version)}">
        <idLote>${xmlEscape(lotId)}</idLote>
        <indSinc>1</indSinc>
        ${signedNfeXml}
      </enviNFe>
    </nfeDadosMsg>
  </soap12:Body>
</soap12:Envelope>`;
}

export function buildXmlPreflightValidation(xml, requiredLocalNames = []) {
  const text = String(xml || '');
  const errors = [];
  if (!text.trim()) errors.push('XML vazio.');
  for (const name of requiredLocalNames) {
    const safeName = String(name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!safeName) continue;
    const pattern = new RegExp(`<([A-Za-z0-9_]+:)?${safeName}(\\s|>)`);
    if (!pattern.test(text)) errors.push(`Tag obrigatoria ausente: ${name}.`);
  }
  return {
    ok: errors.length === 0,
    errors,
  };
}
