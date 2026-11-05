import { createHash, timingSafeEqual } from 'crypto';
import { ROOM_TEMPLATES } from '@/lib/templates';
import type { AppState, Room } from '@/lib/types';
import { gerarHtmlPdf, tituloPdf, AcessoPdf } from '@/lib/server/pdf-template';
import { erro, ok } from '@/lib/server/pedido';
import { ErroApi, lerCorpo, rota } from '@/lib/server/rota';

export const runtime = 'nodejs';

/** Compara a senha em tempo constante (hash dos dois lados → mesmo tamanho). */
function senhaConfere(enviada: string, esperada: string): boolean {
  const a = createHash('sha256').update(enviada).digest();
  const b = createHash('sha256').update(esperada).digest();
  return timingSafeEqual(a, b);
}

function comodo(label: string, medidas: Partial<Room>): Room {
  const t = ROOM_TEMPLATES.find(x => x.label === label);
  if (!t) throw new ErroApi(500, 'template_ausente');
  return { ...t.create(), inst: 'Embutida na parede', ...medidas };
}

/** Orçamento residencial de exemplo: casa em reforma com sala e quarto. */
function dadosTeste(): AppState {
  const sala = comodo('Sala típica', { c: '5', l: '4', dq: '6' });
  const quarto = comodo('Quarto típico', { c: '4', l: '3.5', dq: '9' });
  return {
    id: 'teste',
    imovel: 'Casa',
    obra: 'Reforma',
    cobertura: 'Laje',
    rede: 'Bifásico',
    rooms: [sala, quarto],
    equips: [{
      id: 'eq-teste-1',
      tipo: 'Ar-condicionado',
      room: quarto.id,
      pot: '1400',
      tens: '220V',
      dint: '2',
      dist: '10',
      alim: 'Unidade interna',
    }],
    step: 4,
    edicao: null,
  };
}

/**
 * PDF de teste SEM pagamento, para o dono do app conferir o relatório.
 * Sem TESTE_SENHA definida a rota "não existe" (404); senha errada → 401.
 */
export const POST = rota('pdf-teste', async (req) => {
  const esperada = process.env.TESTE_SENHA ?? '';
  if (!esperada) return erro(404, 'nao_encontrado');

  const corpo = await lerCorpo(req, 2_000);
  if (!senhaConfere(String(corpo?.senha ?? ''), esperada)) return erro(401, 'senha_invalida');

  const acesso: AcessoPdf = {
    codigo: 'TESTE-0000-0000',
    expiraEm: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    edicao: 0,
    nome: 'TESTE',
  };
  const dados = dadosTeste();
  let html: string;
  try {
    html = gerarHtmlPdf(dados, acesso);
  } catch (e) {
    throw new ErroApi(500, 'geracao_falhou', e);
  }
  return ok({ html, nomeArquivo: `${tituloPdf(dados, acesso)}.html` });
});
