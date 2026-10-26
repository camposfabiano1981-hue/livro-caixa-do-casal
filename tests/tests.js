/* Testes das contas do app (dados fictícios). Abra tests/index.html no navegador. */
(function () {
  'use strict';
  const T = window.LCC_TESTE;
  const res = [];
  const igual = (nome, obtido, esperado) => {
    const ok = typeof esperado === 'number' ? Math.abs(obtido - esperado) < 0.005 : obtido === esperado;
    res.push({ nome, ok, obtido, esperado });
  };

  // valores digitados (aceita contas, como na planilha)
  igual('197/2 = 98,50', T.parseValor('197/2'), 98.5);
  igual('283,75/2 = 141,875', T.parseValor('283,75/2'), 141.875);
  igual('1.234,56', T.parseValor('1.234,56'), 1234.56);
  igual('R$ 2.400', T.parseValor('R$ 2.400'), 2400);
  igual('6900+2400', T.parseValor('6900+2400'), 9300);
  igual('texto inválido não vira número', Number.isNaN(T.parseValor('abc')), true);

  // meses de competência
  igual('dez/26 + 1 mês = jan/27', T.mAdd('2026-12', 1), '2027-01');
  igual('de out/26 a dez/27 são 14 meses', T.mDiff('2026-10', '2027-12'), 14);

  // cenário fictício do casal
  const M = '2026-10';
  T.S.cfg = T.normCfg({
    inicio: M,
    pessoas: { p1: { nome: 'Ana' }, p2: { nome: 'Beto' } },
    cartoes: [{ id: 'k1', nome: 'Cartão', titular: 'p1', cor: 1 }],
    saldoInicial: { p1: 1000, p2: 500 },
  });
  const item = (id, d) => [id, Object.assign({ id, st: {} }, d)];
  T.S.series = new Map([
    item('sal1', { tipo: 'receita', desc: 'Salário', pessoa: 'p1', cat: 'salario', v: { [M]: 6000 } }),
    item('sal2', { tipo: 'receita', desc: 'Salário', pessoa: 'p2', cat: 'salario', v: { [M]: 5000 } }),
    item('viagem', { tipo: 'despesa', desc: 'Viagem', pessoa: 'casal', div: 50, cat: 'lazer', forma: 'cartao', cartao: 'k1', parc: { n: 2, de: 10, ini: M }, v: { [M]: 200, '2026-11': 200 } }),
    item('curso', { tipo: 'despesa', desc: 'Curso', pessoa: 'p2', cat: 'educacao', forma: 'cartao', cartao: 'k1', parc: { n: 1, de: 3, ini: M }, v: { [M]: 300 }, st: { [M]: 'pago' } }),
    item('aluguel', { tipo: 'despesa', desc: 'Aluguel', pessoa: 'p1', cat: 'moradia', forma: 'boleto', pagador: 'p1', rec: true, v: { [M]: 1000 } }),
    item('sofa', { tipo: 'despesa', desc: 'Sofá', pessoa: 'p2', cat: 'casa', forma: 'pix', pagador: 'p2', v: { [M]: 500 }, st: { [M]: 'espera' } }),
    item('ajuda', { tipo: 'transf', desc: 'Ajuda de custo', de: 'p1', para: 'p2', cat: 'transf', v: { [M]: 400 } }),
  ]);
  const casal = T.totals(M, 'casal'), ana = T.totals(M, 'p1'), beto = T.totals(M, 'p2');
  igual('receitas do casal', casal.rec, 11000);
  igual('despesas do casal (sem o item em espera)', casal.desp, 1500);
  igual('sobra do casal', casal.sobra, 9500);
  igual('despesas de Ana: metade da viagem + aluguel', ana.desp, 1100);
  igual('sobra de Ana com a transferência saindo', ana.sobra, 4500);
  igual('sobra de Beto com a transferência entrando', beto.sobra, 5000);
  igual('transferência eliminada na visão do casal', ana.sobra + beto.sobra, casal.sobra);
  igual('item em espera fica fora das contas, mas visível', beto.espera, 500);
  igual('parcelas de Beto: metade da viagem + curso', beto.parcelas, 400);
  igual('contas pagas do casal', casal.pago, 300);
  const ac = T.acerto(M);
  igual('acerto: Beto deve a Ana a parte dele no cartão dela', ac.deve.p2, 400);
  igual('acerto: Ana não deve nada a Beto', ac.deve.p1, 0);
  igual('parcela da viagem em jan/27 = 5/10', T.parcLabel(T.S.series.get('viagem'), '2027-01'), '5/10');
  const pj = T.projecao('casal');
  igual('saldo acumulado = saldo inicial + sobra do mês', pj[0].saldo, 1500 + 9500);
  igual('saldo de nov/26 desconta a parcela da viagem', pj[1].saldo, 11000 - 200);
  const fat = T.faturas(M, 'casal').find((f) => f.c.id === 'k1');
  igual('fatura do cartão no mês', fat.total, 500);
  igual('fatura: parte de Beto', fat.porP.p2, 400);

  const falhas = res.filter((r) => !r.ok);
  document.getElementById('resumo').textContent = falhas.length ? `${falhas.length} de ${res.length} testes falharam` : `Todos os ${res.length} testes passaram`;
  document.getElementById('resumo').className = falhas.length ? 'falha' : 'ok';
  document.getElementById('lista').innerHTML = res.map((r) => `<li class="${r.ok ? 'ok' : 'falha'}">${r.nome}${r.ok ? '' : ` — obtido <code>${String(r.obtido)}</code>, esperado <code>${String(r.esperado)}</code>`}</li>`).join('');
  window.LCC_RESULTADO = { total: res.length, falhas: falhas.map((f) => f.nome) };
})();
