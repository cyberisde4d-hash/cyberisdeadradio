AURA ADMIN — atualização Info Popups

Arquivos alterados:
- public/index.html
- public/admin-firebase/index.html
- public/admin-firebase/admin.js
- public/admin-firebase/admin.css

O que foi adicionado:
- seção Info Popups no admin para editar About, Contact e Donate sem mexer em código.
- campos para título, descrição, texto principal, texto extra, botões, links, imagens, vídeos, embed URL, redes sociais, formulário e acesso.
- site agora lê settings/infoCards no Firestore e aplica os popups na home.

Deploy:
firebase deploy --only hosting
