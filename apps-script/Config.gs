/**
 * SimulFlow — Presença operacional (Google Apps Script).
 * Configuração do turno e nomes das abas da planilha.
 * Todos os arquivos .gs do projeto compartilham o mesmo escopo global.
 */
var CONFIG = {
  FUSO: 'America/Sao_Paulo',
  TURNO_INICIO: '07:30',
  TURNO_FIM: '16:40',
  // O gatilho roda a cada 5 minutos. Fechar até esta tolerância após 16:40 conta como "automático";
  // depois disso (ex.: Google fora do ar, gatilho não instalado) conta como "tardio".
  TOLERANCIA_AUTOMATICO_MIN: 15,
  ABAS: {
    COLABORADORES: 'Colaboradores',
    REGISTROS: 'Registros',
    TURNOS: 'Turnos',
    HISTORICO: 'Histórico detalhado',
    ACESSOS: 'Acessos',
    HOJE: 'Hoje',
    DADOS: 'Dados',
    CONFIG: 'Config',
  },
  // leitor: só registra leituras · sistema: computador de setor (dados do SimulFlow, sem presença)
  // planejamento: presença + dados · admin: tudo, inclusive fechar o turno, acessos e substituir dados.
  PERFIS: ['leitor', 'sistema', 'planejamento', 'admin'],
};

/** Relógio (os testes substituem esta função para simular horários). */
function agoraAtual() {
  return new Date();
}
