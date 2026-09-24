# Deployment handoff

- The user works on `main`; do not create another branch unless they explicitly change this preference.
- After pushing updates, always provide **one complete server command** covering pull, build, database migrations, activation, and verification:

  ```bash
  cd /var/www/sari && test "$(git branch --show-current)" = main && git pull --ff-only origin main && bash scripts/update-sary.sh
  ```

- Do not present `git pull` or `BUILD_OK` as a completed deployment. The updater prints `DEPLOY_OK` after checking the running release and public Arabic/English pages.
- Keep that command usable when changing deployment tooling. The established server profile and recovery details are in `docs/PRODUCTION_RELEASE_RUNBOOK.md`.
