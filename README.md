# Livro-Caixa do Casal

Gestão financeira do casal: os dois lançam e acompanham, no computador e no celular, as receitas, as parcelas de cartão, as contas fixas e as metas, com os dados sincronizados em tempo real pelo **Firebase** (login com Google e Cloud Firestore).

Feito a partir da planilha mensal do casal (parcelas por cartão, contas fixas, salários, 13º, férias e bônus por mês de competência).

## O que tem

**Painel**
- Sobra do mês (casal, um ou outro), receitas, despesas, contas pagas e quem responde por quanto.
- Indicadores: taxa de poupança (meta de 20%), parcelas na renda (referência de até 30%), contas a pagar e saldo projetado.
- Gráficos: sobra mês a mês (toque num mês para abri-lo), saldo acumulado com a reserva ideal, faturas de cartão por mês, despesas por categoria e regra 50/30/20.
- Acerto do casal, alertas automáticos (meses no vermelho, parcelas acima do limite, itens a classificar, maior sobra) e parcelas que terminam nos próximos meses.

**Lançamentos**
- Lista do mês por grupo (receitas, cada cartão, contas, transferências, em espera), com marcação de pago/recebido, filtros e busca.
- Faturas por cartão com a parte de cada um e o **acerto do casal**: o que um pagou pelo outro (itens no cartão do titular e contas pagas por quem não é o responsável).
- Lançamento único, parcelado (valor da parcela ou total, parcela atual) ou mensal; de um, do outro ou dos dois (com a divisão em %). O campo de valor aceita contas, como `197/2`.
- Situação por mês: previsto, pago ou **em espera** (fica visível, mas fora das contas).

**Planilha**
- Grade mês a mês no formato da planilha original, com subtotais por cartão, sobra e saldo acumulado; toque num valor para editar o mês, este e os próximos ou todos.
- Parcelamentos: quanto falta de cada compra e quanto deixa de sair depois da última parcela.

**Metas**
- Reserva de emergência calculada (6 × a média das despesas essenciais dos próximos 12 meses) e metas com valor e prazo, com aportes e retiradas.
- **Posso comprar?**: simula uma compra parcelada e mostra o efeito na sobra de cada mês, nas parcelas sobre a renda e no saldo acumulado.

**Ajustes**
- Pessoas, cartões (titular e vencimento), categorias (Necessidade, Desejo, Futuro ou A classificar), saldo inicial, limites da regra 50/30/20 e da reserva.
- Calculadora de assiduidade (hora com acréscimo do ACT × dias da escala × multiplicador do site, menos o desconto).
- Exportação para Excel (.xlsx, com abas Resumo, Casal, cada pessoa e Lançamentos), CSV e backup (.json); restauração de backup.
- Conta Google, regras do Firestore geradas com os e-mails do casal e configuração do Firebase.

## Como usar

### Online (GitHub Pages)
Acesse o endereço publicado (veja **Publicar no GitHub Pages**). Na primeira abertura, o app pede a configuração do Firebase, o login com Google e, se faltar, as regras do Firestore.

### Como aplicativo no celular e no computador
Abra o endereço e use **Instalar app** (Chrome/Edge) ou **Compartilhar › Adicionar à Tela de Início** (iPhone). O app abre sem internet; os lançamentos feitos off-line sobem quando a conexão voltar.

### Configurar o Firebase (uma vez)
1. Em [console.firebase.google.com](https://console.firebase.google.com/), crie um projeto (ex.: `livro-caixa-casal`). O Google Analytics pode ficar desligado.
2. **Authentication › Método de login**: ative o **Google**.
3. **Authentication › Configurações › Domínios autorizados**: adicione o domínio do app (ex.: `seu-usuario.github.io`).
4. **Firestore Database**: crie o banco no modo de produção (local `southamerica-east1`, São Paulo).
5. **Configurações do projeto › Seus apps**: adicione um app da Web (`</>`) e copie o objeto `firebaseConfig`.
6. Cole a configuração na tela do app **ou** publique-a em `js/nuvem-config.js` para valer em todos os aparelhos sem colar de novo (ela não é senha: o acesso é protegido pelo login e pelas regras).
7. Entre com Google. O app mostra as **regras do Firestore** com o seu e-mail e o da outra pessoa: copie, cole em **Firestore Database › Regras** e publique. O modelo também está em [`firestore.rules`](firestore.rules).

### Dados iniciais
Em **Ajustes › Backup e exportação › Restaurar backup** (ou no botão da tela inicial vazia), importe o arquivo `.json` de backup. Backups e exportações não vão para o repositório (veja `.gitignore`).

## Onde ficam os dados?
No Cloud Firestore do seu projeto, em `livros/principal/…` (`config/app`, `series`, `metas`, `aportes`), e no cache do próprio aparelho para uso sem internet. Só os e-mails listados nas regras, com login Google verificado, leem e gravam. Cada lançamento guarda os valores por mês de competência (`v['AAAA-MM']`) e a situação do mês (`st`: pago ou espera).

## Publicar no GitHub Pages
1. Envie os arquivos para o repositório (branch `main`).
2. Em **Settings › Pages**, escolha **Deploy from a branch**, branch `main`, pasta `/ (root)`, e salve.
3. O endereço fica `https://SEU-USUARIO.github.io/livro-caixa-do-casal/`. Adicione o domínio `SEU-USUARIO.github.io` nos domínios autorizados do Firebase.

Ao publicar uma versão nova, atualize `VERSAO` em `sw.js` e o `?v=` em `index.html` para os aparelhos baixarem os arquivos novos.

## Estrutura

```
index.html            Página do app (estrutura e carregamento)
css/app.css           Estilos (tokens de cor e tipografia, tema claro e escuro)
js/app.js             Painel, lançamentos, planilha, metas, ajustes, gráficos e exportações
js/nuvem.js           Firebase: configuração, login Google, regras, Firestore em tempo real e sem internet
js/nuvem-config.js    firebaseConfig publicado para todos os aparelhos (opcional; em branco = colar na tela)
sw.js                 Service worker (abre sem internet e atualiza os arquivos)
manifest.webmanifest  Instalação como app (ícones e atalhos)
firestore.rules       Modelo das regras de acesso (o app gera com os e-mails)
tests/                Testes das contas (abra tests/index.html no navegador)
```

## Testes
Abra `tests/index.html` no navegador. Os testes usam dados fictícios e conferem valores digitados com contas, meses de competência, divisão do casal, transferência eliminada na visão do casal, itens em espera, contas pagas, acerto entre os dois, numeração das parcelas, faturas e saldo acumulado.

## Referências usadas no desenho
- “Meu, seu e nosso”, divisão de despesas e lembrete de contas, como nos apps para casais (Honeydue, Monarch).
- Faturas de cartão e compras parceladas como peças centrais, como nos apps brasileiros (Mobills, Organizze).
- Regra 50/30/20 sobre a renda líquida; parcelas até 30% da renda líquida (referência de mercado, não regra oficial); reserva de 3 a 6 meses de despesas essenciais.
