# Release plan (manual publish)

1. Ensure `version` in `package.json` is bumped.
2. Build the zip: `npm run build --workspace ragbaz-articulate-plugin`.
3. Create a GitHub repo `ragbaz-articulate-plugin` (if not already).
4. Push contents of this package (not the whole monorepo) to that repo:
   - `git init`
   - `git remote add origin git@github.com:ragbaz/ragbaz-articulate-plugin.git`
   - `git add .`
   - `git commit -m "release vX.Y.Z"`
   - `git tag vX.Y.Z`
   - `git push origin main --tags`
5. Upload `dist/Ragbaz-Articulate.zip` to WordPress.org or GitHub Releases as needed.
6. Update the monorepo reference if the repo URL changes.
