import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

const NFE_XML_NS = 'http://www.portalfiscal.inf.br/nfe';
const NFE_SOAP12_NS = 'http://www.w3.org/2003/05/soap-envelope';
const AUTHORIZED_PROTOCOL_CODES = new Set(['100', '150']);

function trimText(value, maxLength = 1000) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function onlyDigits(value, maxLength = 255) {
  return String(value ?? '').replace(/\D/g, '').slice(0, maxLength);
}

function xmlLocalName(node) {
  return String(node?.localName || node?.nodeName || '').split(':').pop();
}

function findFirstXmlElement(node, localName) {
  if (!node) return null;
  if (node.nodeType === 1 && xmlLocalName(node) === localName) return node;
  for (let index = 0; index < (node.childNodes?.length || 0); index += 1) {
    const found = findFirstXmlElement(node.childNodes[index], localName);
    if (found) return found;
  }
  return null;
}

function childXmlText(node, localName) {
  const child = findFirstXmlElement(node, localName);
  return trimText(child?.textContent || '', 500);
}

function serializeXmlElement(node) {
  return node ? new XMLSerializer().serializeToString(node) : '';
}

export function buildNfeProtocolConsultationSoap({
  accessKey,
  environment = 'homologacao',
  version = '4.00',
} = {}) {
  const key = onlyDigits(accessKey, 44);
  if (key.length !== 44) throw new Error('Chave de acesso invalida para consulta na SEFAZ.');
  const tpAmb = String(environment || '').trim().toLowerCase() === 'producao' ? '1' : '2';
  const safeVersion = /^\d+\.\d+$/.test(String(version || '')) ? String(version) : '4.00';
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="${NFE_SOAP12_NS}">
  <soap12:Body>
    <nfeDadosMsg xmlns="${NFE_XML_NS}/wsdl/NFeConsultaProtocolo4">
      <consSitNFe xmlns="${NFE_XML_NS}" versao="${safeVersion}">
        <tpAmb>${tpAmb}</tpAmb>
        <xServ>CONSULTAR</xServ>
        <chNFe>${key}</chNFe>
      </consSitNFe>
    </nfeDadosMsg>
  </soap12:Body>
</soap12:Envelope>`;
}

export function parseNfeProtocolConsultationResponse(responseBody) {
  const xml = String(responseBody || '');
  const doc = new DOMParser({ onError: () => {} }).parseFromString(xml, 'text/xml');
  const retConsSit = findFirstXmlElement(doc, 'retConsSitNFe');
  const protNFe = findFirstXmlElement(doc, 'protNFe');
  const infProt = findFirstXmlElement(protNFe, 'infProt');
  const fault = findFirstXmlElement(doc, 'Fault');
  return {
    status: retConsSit ? {
      cStat: childXmlText(retConsSit, 'cStat'),
      xMotivo: childXmlText(retConsSit, 'xMotivo'),
      chNFe: childXmlText(retConsSit, 'chNFe'),
      tpAmb: childXmlText(retConsSit, 'tpAmb'),
      dhRecbto: childXmlText(retConsSit, 'dhRecbto'),
    } : null,
    authorization: infProt ? {
      cStat: childXmlText(infProt, 'cStat'),
      xMotivo: childXmlText(infProt, 'xMotivo'),
      chNFe: childXmlText(infProt, 'chNFe'),
      nProt: childXmlText(infProt, 'nProt'),
      dhRecbto: childXmlText(infProt, 'dhRecbto'),
      digVal: childXmlText(infProt, 'digVal'),
      protNFeXml: serializeXmlElement(protNFe),
    } : null,
    fault: fault ? trimText(fault.textContent || '', 1000) : '',
    rawXml: xml,
  };
}

export function getNfeProtocolConsultationCode(consultation = {}) {
  return trimText(
    consultation?.parsed?.authorization?.cStat
      || consultation?.parsed?.status?.cStat,
    10,
  );
}

export function isAuthorizedNfeProtocolConsultation(consultation = {}) {
  const authorization = consultation?.parsed?.authorization || {};
  return AUTHORIZED_PROTOCOL_CODES.has(String(authorization.cStat || ''))
    && onlyDigits(authorization.chNFe, 44).length === 44
    && trimText(authorization.nProt, 80).length > 0;
}

export function shouldConsultNfeProtocolBeforeRetry(document = {}) {
  if (onlyDigits(document?.accessKey, 44).length !== 44) return false;
  const status = trimText(document?.status, 40).toLowerCase();
  const sefazCode = trimText(
    document?.sefazResponse?.authorization?.cStat
      || document?.sefazResponse?.batch?.cStat,
    10,
  );
  if (sefazCode === '204') return true;
  if (status === 'processing') return true;
  if (status !== 'error') return false;
  return Number(document?.sefazResponse?.httpStatus || 0) === 0
    || /tempo esgotado|timeout|sem resposta/i.test(String(document?.error || document?.sefazResponse?.error || ''));
}

export function buildReconciledFiscalDocument(document = {}, consultation = {}, options = {}) {
  if (!isAuthorizedNfeProtocolConsultation(consultation)) {
    return { reconciled: false, code: getNfeProtocolConsultationCode(consultation) };
  }
  const authorization = consultation.parsed.authorization;
  const accessKey = onlyDigits(document?.accessKey, 44);
  const consultedKey = onlyDigits(authorization.chNFe, 44);
  if (accessKey !== consultedKey) {
    throw new Error('A chave retornada pela SEFAZ nao confere com o documento consultado.');
  }

  const payload = document?.payload && typeof document.payload === 'object' && !Array.isArray(document.payload)
    ? { ...document.payload }
    : {};
  const previousNfe = payload.nfe && typeof payload.nfe === 'object' && !Array.isArray(payload.nfe)
    ? payload.nfe
    : {};
  const receivedAt = trimText(consultation.receivedAt, 80) || new Date().toISOString();
  const sefazResponse = {
    request: consultation.request || {},
    httpStatus: Number(consultation.httpStatus || 0),
    httpStatusText: trimText(consultation.httpStatusText, 120),
    batch: null,
    authorization,
    consultation: consultation.parsed.status || null,
    fault: consultation.parsed.fault || '',
    receivedAt,
    reconciledFromProtocolConsultation: true,
  };
  const signedXml = trimText(previousNfe.signedXml, 5_000_000);
  const nfeVersion = trimText(options.nfeVersion, 20) || '4.00';
  const nfeNamespace = trimText(options.nfeNamespace, 200) || NFE_XML_NS;
  const procXml = signedXml && authorization.protNFeXml
    ? `<nfeProc versao="${nfeVersion}" xmlns="${nfeNamespace}">${signedXml}${authorization.protNFeXml}</nfeProc>`
    : '';

  return {
    reconciled: true,
    status: 'authorized',
    accessKey,
    protocol: trimText(authorization.nProt, 80),
    error: '',
    sefazResponse,
    payload: {
      ...payload,
      nfe: {
        ...previousNfe,
        protocol: trimText(authorization.nProt, 80),
        status: 'authorized',
        authorization,
        transmission: sefazResponse,
        protocolConsultedAt: receivedAt,
        procXml,
      },
    },
  };
}
