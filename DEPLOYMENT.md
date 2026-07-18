# Wiregene Synology Deployment Standard

이 문서는 `meta.wiregene.com`의 Synology NAS 배포 기준이자 다른 Wiregene
서브사이트가 재사용할 공통 규격이다. 운영 데이터 삭제 없이, 유한 시간 안에
끝나는 image pull 기반 배포만 허용한다.

## 감사 결론과 변경 전후

| 항목 | 변경 전 | 변경 후 표준 |
| --- | --- | --- |
| build 위치 | NAS 컨테이너 시작 시 `npm ci`/`npm install`과 `npm run build` | GitHub Actions가 production image를 build하고 registry에 push |
| NAS 작업 | source bind mount와 런타임 build | `docker compose pull` 후 `docker compose up -d --remove-orphans` |
| 중복 실행 | script 내부의 불완전한 PID directory lock | 전체 deploy를 감싸는 단일 lock과 `trap` 정리 |
| 실행시간 | Git/Docker/build/health 단계에 전체 상한 없음 | 모든 deploy/rollback/verify 작업에 최대 실행시간 적용 |
| 로그 | scheduler 및 Docker 로그가 계속 증가 | scheduler log bounded rotation, Docker `10m`/`3` rotation |
| 실패 처리 | watchdog가 일부 실패를 성공으로 숨김 | 실패한 외부 명령은 non-zero, 기존 persistent data 보존 |
| health | root URL의 5xx 여부와 container running 위주 | Docker health와 명시적 health URL을 모두 확인 |
| rollback | 수동 recreate 중심, 직전 image 기록 없음 | 직전 정상 image를 기록하고 `--rollback`으로 복귀 |
| 장시간 작업 | web start와 briefing/worker 지시가 혼재 | deploy와 batch/worker/queue를 별도 DSM task로 분리 |

## 변경 파일 목록

Runtime/CI:

- `Dockerfile`, `.dockerignore`
- `.github/workflows/container-image.yml`
- `src/app/api/health/route.ts`, `src/proxy.ts`, `next.config.ts`
- `scripts/synology-deploy.sh`, `scripts/synology-start-meta.sh`
- `scripts/synology-meta-status.sh`, `scripts/synology-meta-watchdog.sh`
- `synology/docker/meta/deploy.env`, `.env.example`, `docker-compose.yml`

Operations/continuity:

- `DEPLOYMENT.md`, `SERVICE.md`, `synology/docker/meta/README.md`
- `docs/deployment-ko.md`, `docs/synology-meta-portal-split.md`, `meta/README.md`
- `guide.md`, `ERROR_LEDGER.md`, `backup.md`
- `package.json`, `package-lock.json`, `src/lib/version.ts`

이 변경은 production data/volume을 삭제하지 않는다. GitHub에 push한 뒤 실제
NAS 작업 실행과 health 검증은 별도 운영 결과로 기록한다.

## Public Interface

Meta의 site wrapper는 `scripts/synology-start-meta.sh`, 공통 engine은
`scripts/synology-deploy.sh`이다. 운영자가 사용하는 public interface는 세
가지뿐이다.

```sh
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh --deploy
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh --rollback
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh --verify-only
```

인수가 없으면 `--deploy`와 동일하다. DSM 작업 스케줄러에는 deploy 작업을
수동 실행 또는 NAS 부팅 시 실행으로 등록한다. 1분 또는 짧은 주기의 반복
배포 작업으로 등록하지 않는다.

### DSM Task Scheduler 최종 명령 한 줄

```sh
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh --deploy
```

DSM 경로: `Control Panel -> Task Scheduler -> 기존 Meta sync/deploy 작업 -> Edit`.
위 한 줄만 남기고 실행 주기는 `Manual` 또는 `Boot-up`으로 설정한다.

## 공통 규격과 사이트 변수 경계

공통 engine이 소유하며 사이트가 변경하면 안 되는 정책:

- atomic lock 획득, stale-lock 판정, `EXIT HUP INT TERM` trap 정리
- deploy/rollback/verify 전체 timeout과 각 외부 명령 실패 전파. grace 뒤
  `SIGKILL`된 worker는 supervisor가 PID 사망을 확인한 뒤 알려진 lock 파일만 정리
- Docker/Compose 실행 파일의 안전한 `command -v` 및 Synology package 경로 탐색
- `docker compose pull` 후 `docker compose up -d --remove-orphans`
- Docker log rotation `max-size: 10m`, `max-file: 3`
- scheduler `deploy.log` rotation `10 MB`/`3`과 secret 비출력
- container running/health와 HTTP health URL 검증
- 직전 정상 image 기록과 rollback
- persistent volume, bind-mounted data, 기존 `.env` 비삭제
- `docker system prune -a`, `volume prune`, `compose down -v`, 무차별
  container 삭제 금지

사이트 wrapper에서만 달라질 수 있는 값:

실제 site config는 `synology/docker/meta/deploy.env`이다.

| 공통 engine 입력 | Meta 값 |
| --- | --- |
| `DEPLOY_SITE_NAME` / `DEPLOY_SERVICE` | `wiregene-meta` / `meta` |
| `DEPLOY_APP_DIR` | `/volume1/docker/wiregene-meta-analysis` |
| `DEPLOY_RUNTIME_DIR` | `/volume1/docker/meta` |
| `DEPLOY_COMPOSE_FILE` / `DEPLOY_ENV_FILE` | runtime compose와 `/volume1/docker/meta/.env` |
| `DEPLOY_CONTAINER_NAME` | `wiregene-meta` |
| `DEPLOY_IMAGE_ENV_KEY` | `META_IMAGE` |
| `DEPLOY_IMAGE_REPOSITORY` | `ghcr.io/rhhyun/wiregene-meta-analysis` |
| `DEPLOY_IMAGE` | `ghcr.io/rhhyun/wiregene-meta-analysis:main` |
| rollback image | local `wiregene-meta-analysis:nas-rollback` |
| port env/default | `HOST_PORT`, `3001` |
| `DEPLOY_HEALTH_PATH` | `/api/health` |
| timeout | 전체 `600s`, 종료 grace `20s`, health verify `180s` |
| 앱 필수 환경변수 | auth, storage, AI/provider 관련 Meta 값 |

새 Wiregene 사이트는 공통 engine을 복사해 수정하지 않는다. 얇은 site wrapper와
compose/site 환경값만 추가한다.

## Registry Access

GHCR package가 public이면 별도 인증이 필요 없다. Private package라면 DSM
scheduler 실행 사용자에게 classic PAT `read:packages` 권한으로 한 번만 Docker login을
설정한다. token을 저장소, `.env`, Task Scheduler 명령, 로그에 넣지 않는다.

```sh
printf '%s' "$GHCR_READ_TOKEN" | docker login ghcr.io --username rhhyun --password-stdin
docker pull ghcr.io/rhhyun/wiregene-meta-analysis:main
```

위 명령의 token 값은 interactive shell의 일회성 환경으로 전달하고 명령
이력/공유 문서에 실제 값을 남기지 않는다. 배포 engine은 기존 Docker registry
credential을 사용한다.

## 안전 동작 순서

`--deploy`는 다음 순서로만 동작해야 한다.

1. 제한된 DSM `PATH`에서도 Git, Docker, Compose, timeout 도구를 찾는다.
2. deploy 전체 lock을 획득한다. lock 획득 전 장시간 `git pull` 또는 image
   pull을 실행하지 않는다.
3. wrapper가 공통 engine을 runtime의 일회성 파일로 snapshot해 실행하므로,
   이후 Git pull이 현재 실행 중인 script 내용을 바꾸지 않는다. snapshot은
   성공·실패·signal 종료 trap에서 지운다.
4. lock 내부에서 source control file을 `git pull --ff-only`로 갱신하고 full
   commit SHA에 대응하는 immutable `sha-<full-sha>` image를 선택한다.
5. runtime `.env`, compose config, persistent data 경로의 존재와 쓰기 권한을
   검사한다.
6. 현재 정상 image ID를 rollback 상태로 기록한다.
7. registry의 production image를 `docker compose pull`로 먼저 받는다.
8. `docker compose up -d --remove-orphans --no-build`를 실행한다.
9. container running/health와 health URL을 제한시간 안에 확인한다.
10. 성공은 `0`, 실패는 non-zero로 끝내고 모든 종료 경로에서 lock을 지운다.
    강제 timeout은 `124`로 정규화한다.

배포 실패 시 persistent volume, `/volume1/docker/meta/download`,
`/volume1/docker/meta/data`, `/volume1/docker/meta/.env`를 삭제하지 않는다.
실패한 새 image를 고치기 위해 NAS에서 npm install/build를 실행하지 않는다.
GitHub Actions workflow는 linux/amd64 image를 검증 후 `main`과 immutable
`sha-<full-sha>` tag를 게시하며 DS918+는 `META_IMAGE`로 지정된 image를
pull한다. Deploy 직전 정상 image는 local `nas-rollback` tag로 보존한다.
GitHub push 직후에는 `.github/workflows/container-image.yml`이 성공해 해당 SHA
image가 게시된 것을 먼저 확인한다. SHA image가 아직 없으면 deploy는 기존
container를 교체하지 않고 non-zero로 끝나며, CI 성공 후 같은 DSM task를 다시
실행한다.

## 첫 Legacy 전환 안전책

Ver 2.59 이전 Meta는 `node:24-bookworm-slim`, source bind mount, NAS
npm/build command를 사용했다. 이 container의 base image ID를 새 standalone
compose에 그대로 tag해도 유효한 application rollback image가 되지 않는다.

첫 `--deploy`는 운영 container를 건드리기 전에 다음을 자동 수행한다.

1. 기존 runtime compose가 legacy source-build 형식인지 감지한다.
2. 기존 정의를
   `/volume1/docker/meta/docker-compose.legacy-rollback.yml`에 보존한다.
3. 현재 legacy container가 실행 중이고 이미 만든 `.next/BUILD_ID`와 Next.js
   binary가 있는지 검사한다. 없으면 NAS에서 다시 build하지 않고 cutover 전에
   실패한다.
4. `npm install`/build를 전혀 호출하지 않고 기존 산출물로 `next start`만 하는
   제한된 `on-failure:3` rollback override를 원자적으로 만든 뒤
   `/volume1/docker/meta/.rollback-state`에 `rollback_mode=legacy`를 기록한다.
5. 새 immutable SHA image를 pull한 뒤, volume과 host port가 없는 unique
   isolated probe container로 image 자체의 Docker health를 확인한다.
6. probe가 실패하면 probe만 targeted cleanup하고 기존 production container는
   변경하지 않은 채 non-zero로 끝낸다.

probe 통과 후 실제 cutover에서 Compose 또는 strict health 검증이 실패하면
engine은 저장된 legacy compose와 build 없는 override를 자동 선택한다. 이 첫
전환에 한해서 emergency rollback은 보존된 기존 build 산출물만 사용하며 전체
`600s` timeout과 제한된 `on-failure:3` 정책 안에서만 실행된다. 데이터 mount는
삭제하지 않는다. 이는 정상 배포 방식이 아니라 기존 production을 되살리기 위한
1회성 호환 경로다.

첫 prebuilt image 배포가 성공한 뒤 다음 정상 배포부터 `.rollback-state`는
`rollback_mode=image`가 되고, 직전 application image를 local
`wiregene-meta-analysis:nas-rollback` tag로 보존한다. 일반 `--rollback`은 이
prebuilt image를 사용하므로 npm/build를 실행하지 않는다. Operator 명령은 두
경우 모두 동일하며 state에 따라 engine이 자동 선택한다.

## Rollback

직전 정상 image로 복귀:

```sh
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh --rollback
```

rollback도 동일한 lock, timeout, compose/health 검증을 거친다. 데이터 volume을
되돌리거나 삭제하지 않는다. rollback 자체가 실패하면 non-zero로 끝나며 현재
container와 data를 무차별 삭제하지 않는다.

## Verification

배포를 변경하지 않고 검증:

```sh
/bin/sh /volume1/docker/wiregene-meta-analysis/scripts/synology-start-meta.sh --verify-only
```

직접 확인이 필요할 때는 follow 모드를 사용하지 않는다.

```sh
docker compose -f /volume1/docker/meta/docker-compose.yml --env-file /volume1/docker/meta/.env ps
docker inspect -f '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}} {{.RestartCount}}' wiregene-meta
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3001/api/health
docker logs --tail 100 wiregene-meta
```

인증 앱의 `/`가 `401`을 반환할 수 있으므로 root URL의 `401`만으로 장애를
판정하지 않는다. health endpoint와 Docker health를 함께 본다.

## DSM 실등록 작업과 잔류 프로세스 감사

저장소 문서만으로 DSM UI에 남은 과거 작업을 확정할 수 없다. NAS에서 읽기
전용으로 실등록 명령을 확인한다.

```sh
/usr/syno/bin/synoschedtask --get
```

다음 항목이 등록되어 있으면 disable 후 검토한다.

- `synology-start-meta.sh` 또는 raw `docker compose up`을 1분마다 실행
- `docker logs -f`, `tail -f`, `npm run dev`, `next dev`, `npm start`
- NAS에서 `npm install`, `npm ci`, `npm run build`, `docker compose build`
- Meta task 안에서 Portal, briefing, worker, queue, migration을 연속 실행
- `nohup ... &`로 host server를 남기는 legacy command

배포 종료 후 scheduler의 자식 shell/Git/npm/build 프로세스가 남지 않았는지
확인한다. Docker daemon이 관리하는 `wiregene-meta` container는 정상적인 장기
서비스이므로 잔류 scheduler process와 구분한다.

```sh
ps | grep -E 'synology-(start-meta|deploy)|git .*wiregene-meta-analysis|npm (ci|install|run build)|next dev' | grep -v grep
docker ps --filter name=wiregene-meta
```

첫 명령은 출력이 없어야 하고, 두 번째 명령에는 healthy한 Meta container
하나만 있어야 한다.

## Deprecated Paths

다음 방식은 Meta active deployment에서 금지한다.

- `scripts/synology-web-start.sh`의 host `nohup npm run start` 방식
- `scripts/synology-start-meta-portal.sh`로 Meta와 Portal을 묶어 시작
- Meta deploy task 안에서 research briefing generator 실행
- source checkout의 `node_modules`를 삭제하고 NAS에서 rebuild
- `META_FORCE_RECREATE=true`를 반복 스케줄에 사용

Portal과 briefing이 필요하면 각 저장소의 별도 scheduler task와 별도 lock,
timeout, log policy를 사용한다. 이 저장소에 남아 있던 cross-site Synology 진입점은
즉시 non-zero로 종료하는 fail-closed 안내 stub으로 바꾸었다. 실제 작업은
`/volume1/docker/wiregene-portal` 또는
`/volume1/docker/research-briefing-platform`의 해당 스크립트로 이전한 뒤 별도로
감사해야 한다.
