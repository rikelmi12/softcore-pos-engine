export const SEFAZ_CONNECTORS = {
  GO: {
    uf: 'GO',
    homologacao: {
      autorizacao: 'https://homolog.sefaz.go.gov.br/nfe/services/NFeAutorizacao4',
      consultaProtocolo: 'https://homolog.sefaz.go.gov.br/nfe/services/NFeConsultaProtocolo4',
      statusServico: 'https://homolog.sefaz.go.gov.br/nfe/services/NFeStatusServico4',
      recepcaoEvento: 'https://homolog.sefaz.go.gov.br/nfe/services/NFeRecepcaoEvento4',
      inutilizacao: 'https://homolog.sefaz.go.gov.br/nfe/services/NFeInutilizacao4',
      qrCode: 'https://nfewebhomolog.sefaz.go.gov.br/nfeweb/sites/nfce/danfeNFCe',
      urlChave: 'http://www.sefaz.go.gov.br/nfce/consulta',
    },
    producao: {
      autorizacao: 'https://nfe.sefaz.go.gov.br/nfe/services/NFeAutorizacao4',
      consultaProtocolo: 'https://nfe.sefaz.go.gov.br/nfe/services/NFeConsultaProtocolo4',
      statusServico: 'https://nfe.sefaz.go.gov.br/nfe/services/NFeStatusServico4',
      recepcaoEvento: 'https://nfe.sefaz.go.gov.br/nfe/services/NFeRecepcaoEvento4',
      inutilizacao: 'https://nfe.sefaz.go.gov.br/nfe/services/NFeInutilizacao4',
      qrCode: 'https://nfeweb.sefaz.go.gov.br/nfeweb/sites/nfce/danfeNFCe',
      urlChave: 'http://www.sefaz.go.gov.br/nfce/consulta',
    },
  },
};

export function resolveSefazServices({ uf, environment = 'homologacao', overrides = {} } = {}) {
  const safeUf = String(uf || '').trim().toUpperCase();
  const safeEnvironment = String(environment || '').trim().toLowerCase() === 'producao'
    ? 'producao'
    : 'homologacao';
  const fromRegistry = SEFAZ_CONNECTORS[safeUf]?.[safeEnvironment];
  const custom = overrides && typeof overrides === 'object' && !Array.isArray(overrides)
    ? overrides
    : {};
  const services = {
    ...(fromRegistry || {}),
    ...custom,
  };
  if (!services.autorizacao && !services.statusServico && !services.qrCode) {
    throw new Error(`Conector SEFAZ nao configurado para UF ${safeUf || 'nao informada'} em ${safeEnvironment}.`);
  }
  return {
    uf: safeUf,
    environment: safeEnvironment,
    builtin: Boolean(fromRegistry),
    ...services,
  };
}
