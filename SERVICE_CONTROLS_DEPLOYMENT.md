# Service controls deployment — 2026-11-01

User explicitly authorized updating church-ecosystem-eight.vercel.app after the Vercel Production/staging-branch domain overlap was explained.

- Existing project: ihimbazwe-s-projects/church-ecosystem
- Deployment: dpl_8jkjzFFnFHJrjuHLGT4yzm3FsfaE
- Inspector: https://vercel.com/ihimbazwe-s-projects/church-ecosystem/8jkjzFFnFHJrjuHLGT4yzm3FsfaE
- Domain: https://church-ecosystem-eight.vercel.app
- Result: READY; production alias assigned successfully.
- Method: frontend-only prebuilt static artifact; no Git commit/push and no Render deployment.
- Build settings: staging banner; live API https://kacyiru-api.onrender.com; API fallback and demo seed disabled.
- Public index SHA256 matches artifact: FE775E4B05D658FA671ED228474FE4ED9FF3173A91B563CD916F1CBA74F161F8.
- Authenticated UI verification: Add and Change visible on Superseded v1 and Active v2. No console warnings/errors at inspection.
- No draft created; no service writes or activations performed. Save/deactivate operations remain for user testing.
- Screenshot: deployed-service-controls.jpg
- Existing frontend verification: 310 tests passed; build, bundle, boundaries and translation checks passed. Final focused rerun: 18 tests passed; final build/bundle passed.

The four implementation files remain uncommitted locally. Future Git-based deployments must include those edits to retain these controls. Existing architectural limitations (global scheduling ownership and non-atomic lifecycle writes) were not changed or verified.
