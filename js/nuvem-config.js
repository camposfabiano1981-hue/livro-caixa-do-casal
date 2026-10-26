/*
 * Configuração pública do projeto Firebase (objeto firebaseConfig do console). Não é senha: o acesso aos dados é
 * protegido pelo login Google e pelas regras do Firestore. Preenchida aqui, vale para todos os aparelhos; em branco
 * (null), o app pede para colar a configuração na primeira abertura, só naquele aparelho.
 *
 * livro: nome do livro-caixa no Firestore (livros/{livro}/...). Mantenha 'principal' para os dois usarem o mesmo.
 */
window.LCC_NUVEM = {
  firebaseConfig: {
    apiKey: 'AIzaSyBBoBaM1S7YH9RQZzAlB0YxlsH00P_NthQ',
    authDomain: 'livro-caixa-casal-90471.firebaseapp.com',
    projectId: 'livro-caixa-casal-90471',
    storageBucket: 'livro-caixa-casal-90471.firebasestorage.app',
    messagingSenderId: '77443625352',
    appId: '1:77443625352:web:4a35d765b582bfb2918a3d'
  },
  livro: 'principal'
};
