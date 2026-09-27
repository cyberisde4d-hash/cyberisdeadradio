FIX REAL VALIDADO

O que foi corrigido:
- Removido o erro de JavaScript causado por CSS inserido dentro de uma template string no index.html.
- Admin de artigos continua com apenas "Mídias do popup — JSON avançado opcional".
- Campos antigos "Mídias do popup — imagens..." e "Mídias do popup — vídeos/embeds..." não existem no admin.js entregue.
- Validação feita com node --check nos scripts inline do index.html, admin.js e sw.js.

Como usar:
1. Substitua o index.html da raiz por este index.html.
2. Substitua o public/index.html por public/index.html.
3. Substitua a pasta admin-firebase pela pasta admin-firebase deste pacote.
4. Rode: firebase deploy --only hosting
