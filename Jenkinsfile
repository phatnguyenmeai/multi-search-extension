// CI/CD pipeline for the Multi Search browser extension.
//
// Builds the per-browser packages from core/ + each manifest, then submits
// each one to its store. Publishing runs automatically on the `main` branch
// and on tag builds; on other branches it builds + packages only.
//
// ---------------------------------------------------------------------------
// Agent requirements: bash, zip, curl, jq, and Node.js 18+ (for npx).
//
// Jenkins credentials to create (Manage Jenkins > Credentials), all
// "Secret text" unless noted:
//
//   Chrome Web Store        Edge Add-ons            Firefox AMO
//   ------------------      ------------------      ------------------
//   cws-client-id           edge-api-key            amo-jwt-issuer
//   cws-client-secret       edge-client-id          amo-jwt-secret
//   cws-refresh-token
//
// Non-secret store IDs are set in the environment{} block below — edit them
// to match your store listings before the first publish.
// ---------------------------------------------------------------------------

pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    timeout(time: 45, unit: 'MINUTES')
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  parameters {
    booleanParam(name: 'PUBLISH_CHROME',  defaultValue: true,  description: 'Submit to the Chrome Web Store')
    booleanParam(name: 'PUBLISH_EDGE',    defaultValue: true,  description: 'Submit to Microsoft Edge Add-ons')
    booleanParam(name: 'PUBLISH_FIREFOX', defaultValue: true,  description: 'Submit to Firefox AMO')
    booleanParam(name: 'DRY_RUN',         defaultValue: false, description: 'Build and package only; skip every store submission')
  }

  environment {
    // Non-secret store identifiers — edit to match your listings.
    CHROME_EXTENSION_ID = 'REPLACE_WITH_CHROME_EXTENSION_ID'
    EDGE_PRODUCT_ID     = 'REPLACE_WITH_EDGE_PRODUCT_ID'
    FIREFOX_ADDON_ID    = 'multi-search@phatnguyenmeai.github.io'
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Validate') {
      // Cheap sanity checks so a broken build never reaches a store.
      steps {
        sh '''
          set -eu
          for f in core/background.js core/content.js core/popup.js; do
            node --check "$f"
          done
          for f in chrome/manifest.json edge/manifest.json firefox/manifest.json; do
            jq empty "$f"
          done
        '''
        script {
          env.VERSION = sh(script: 'jq -r .version chrome/manifest.json', returnStdout: true).trim()
          echo "Extension version: ${env.VERSION}"
        }
      }
    }

    stage('Build') {
      steps {
        sh '''
          set -eu
          chmod +x build.sh
          ./build.sh chrome edge firefox
        '''
      }
    }

    stage('Package') {
      steps {
        sh '''
          set -eu
          for browser in chrome edge firefox; do
            ( cd "dist/$browser" && zip -r -FS "../${browser}-${VERSION}.zip" . -x '.*' )
          done
          ls -la dist/*.zip
        '''
        archiveArtifacts artifacts: 'dist/*.zip', fingerprint: true
      }
    }

    stage('Publish: Chrome Web Store') {
      when {
        allOf {
          expression { return !params.DRY_RUN }
          expression { return params.PUBLISH_CHROME }
          anyOf { branch 'main'; buildingTag() }
        }
      }
      steps {
        withCredentials([
          string(credentialsId: 'cws-client-id',     variable: 'CWS_CLIENT_ID'),
          string(credentialsId: 'cws-client-secret', variable: 'CWS_CLIENT_SECRET'),
          string(credentialsId: 'cws-refresh-token', variable: 'CWS_REFRESH_TOKEN')
        ]) {
          sh '''
            set -eu
            npx --yes chrome-webstore-upload-cli@3 upload \
              --source "dist/chrome-${VERSION}.zip" \
              --extension-id "${CHROME_EXTENSION_ID}" \
              --client-id "${CWS_CLIENT_ID}" \
              --client-secret "${CWS_CLIENT_SECRET}" \
              --refresh-token "${CWS_REFRESH_TOKEN}" \
              --auto-publish
          '''
        }
      }
    }

    stage('Publish: Edge Add-ons') {
      when {
        allOf {
          expression { return !params.DRY_RUN }
          expression { return params.PUBLISH_EDGE }
          anyOf { branch 'main'; buildingTag() }
        }
      }
      steps {
        withCredentials([
          string(credentialsId: 'edge-api-key',   variable: 'EDGE_API_KEY'),
          string(credentialsId: 'edge-client-id', variable: 'EDGE_CLIENT_ID')
        ]) {
          // Edge Add-ons API v1.1: upload package -> poll -> publish -> poll.
          sh '''
            set -eu
            BASE="https://api.addons.microsoftedge.microsoft.com/v1/products/${EDGE_PRODUCT_ID}/submissions"
            AUTH="Authorization: ApiKey ${EDGE_API_KEY}"
            CID="X-ClientID: ${EDGE_CLIENT_ID}"

            poll() {
              # $1 = status URL
              for _ in $(seq 1 60); do
                resp=$(curl -fsS "$1" -H "$AUTH" -H "$CID")
                st=$(echo "$resp" | jq -r '.status')
                echo "  status: $st"
                case "$st" in
                  Succeeded) return 0 ;;
                  Failed|Cancelled) echo "$resp"; return 1 ;;
                esac
                sleep 15
              done
              echo "timed out waiting for $1"; return 1
            }

            echo "Uploading Edge package..."
            upload_op=$(curl -fsS -X POST "${BASE}/draft/package" \
              -H "$AUTH" -H "$CID" -H "Content-Type: application/zip" \
              --data-binary @"dist/edge-${VERSION}.zip" \
              -D - -o /dev/null | tr -d '\\r' | awk 'tolower($1)=="location:"{print $2}')
            poll "${BASE}/draft/package/operations/${upload_op}"

            echo "Publishing Edge submission..."
            publish_op=$(curl -fsS -X POST "${BASE}" \
              -H "$AUTH" -H "$CID" --data '' \
              -D - -o /dev/null | tr -d '\\r' | awk 'tolower($1)=="location:"{print $2}')
            poll "${BASE}/operations/${publish_op}"
          '''
        }
      }
    }

    stage('Publish: Firefox AMO') {
      when {
        allOf {
          expression { return !params.DRY_RUN }
          expression { return params.PUBLISH_FIREFOX }
          anyOf { branch 'main'; buildingTag() }
        }
      }
      steps {
        withCredentials([
          string(credentialsId: 'amo-jwt-issuer', variable: 'AMO_JWT_ISSUER'),
          string(credentialsId: 'amo-jwt-secret', variable: 'AMO_JWT_SECRET')
        ]) {
          sh '''
            set -eu
            npx --yes web-ext@latest sign \
              --source-dir "dist/firefox" \
              --artifacts-dir "dist/firefox-signed" \
              --channel listed \
              --api-key "${AMO_JWT_ISSUER}" \
              --api-secret "${AMO_JWT_SECRET}"
          '''
        }
      }
    }
  }

  post {
    success {
      echo "Multi Search ${env.VERSION} pipeline finished."
    }
    cleanup {
      cleanWs()
    }
  }
}
