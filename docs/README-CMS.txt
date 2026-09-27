AURA ARCHIVE — versão com Decap CMS

Arquivos principais:
- index.html: site atualizado carregando conteúdo de /data/*.json
- data/: conteúdo editável do site
- admin/: painel Decap CMS
- firebase.json: configuração do Firebase Hosting

Teste local simples:
1) Abra esta pasta no VS Code.
2) Rode um servidor local, por exemplo:
   python -m http.server 8888
3) Acesse:
   http://localhost:8888/

Teste do Decap CMS local:
1) Instale:
   npm install -g decap-server
2) Na pasta do projeto, rode:
   npx decap-server
3) Em outro terminal, rode:
   python -m http.server 8888
4) Acesse:
   http://localhost:8888/admin/

Deploy Firebase:
1) npm install -g firebase-tools
2) firebase login
3) firebase init hosting
4) escolha esta pasta como public, ou mantenha firebase.json deste pacote
5) firebase deploy

IMPORTANTE:
O Decap em produção precisa de login Git. O config.yml está em git-gateway, ideal para Netlify Identity/Git Gateway.
Se você quiser usar Firebase Hosting + Decap, o conteúdo continua sendo editado no GitHub pelo Decap e o Firebase recebe deploy do repositório.
