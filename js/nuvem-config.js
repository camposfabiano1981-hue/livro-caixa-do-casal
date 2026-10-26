/*
 * Configuração pública do projeto Firebase (objeto firebaseConfig do console). Não é senha: o acesso aos dados é
 * protegido pelo login Google e pelas regras do Firestore. Preenchida aqui, vale para todos os aparelhos; em branco
 * (null), o app pede para colar a configuração na primeira abertura, só naquele aparelho.
 *
 * livro: nome do livro-caixa no Firestore (livros/{livro}/...). Mantenha 'principal' para os dois usarem o mesmo.
 */
window.LCC_NUVEM = {
  firebaseConfig: null,
  // firebaseConfig: {
  //   apiKey: '...',
  //   authDomain: 'seu-projeto.firebaseapp.com',
  //   projectId: 'seu-projeto',
  //   storageBucket: 'seu-projeto.firebasestorage.app',
  //   messagingSenderId: '...',
  //   appId: '...'
  // },
  livro: 'principal'
};
