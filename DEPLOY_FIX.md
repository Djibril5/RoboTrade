# Fix deploy GitHub Pages - ETAPES OBLIGATOIRES

PROBLEME: ancien workflow peaceiris bloque sans permissions

SOLUTION NOUVELLE (officielle GitHub 2024+):

1. Dans GitHub repo: Settings > Pages
   -> Build and deployment > Source = "GitHub Actions" (PAS "Deploy from a branch")
   Si tu laisses "branch", ca ne deploiera JAMAIS avec le nouveau workflow

2. Settings > Actions > General > Workflow permissions
   -> Coche "Read and write permissions" + Save

3. Push:
   git add .
   git commit -m "fix: github pages deploy v2"
   git push origin main

4. Va dans onglet Actions, tu verras 2 jobs: build + deploy

5. URL: https://TONUSER.github.io/NOM-DU-REPO/

Si 404:
- Verifie que ton repo s'appelle pas tonuser.github.io (si oui, mets base: '/' dans vite.config.js)
- Sinon base: './' est bon

ENV API:
Settings > Secrets and variables > Actions > New repository secret
Name: VITE_TWELVEDATA_KEY
Value: f45f391e685f486ab17da01476c49f5a

Puis relance deploy: Actions > Run workflow
