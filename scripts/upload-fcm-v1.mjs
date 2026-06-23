/**
 * Uploads FCM V1 Google Service Account Key to Expo EAS credentials.
 * Uses the local EAS session (no login needed — user already logged in).
 *
 * Steps:
 *  1. Query account ID for the logged-in user
 *  2. Create a GoogleServiceAccountKey credential
 *  3. Get/create AndroidAppCredentials for com.rottaurbana.app
 *  4. Assign the key as the FCM V1 key
 */

import { readFileSync } from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Config ────────────────────────────────────────────────────────────────
const PROJECT_ID   = 'bbcecab6-1204-49cf-922b-0bc3b749d070';  // from app.json
const APP_PACKAGE  = 'com.rottaurbana.app';
const STATE_FILE   = path.join(
  process.env.USERPROFILE || process.env.HOME,
  '.expo', 'state.json'
);
const KEY_FILE = path.join(
  process.env.USERPROFILE || process.env.HOME,
  'Downloads',
  'push-5ce18-firebase-adminsdk-ho2e1-e75ab13b7e.json'
);
const GQL_URL = 'https://api.expo.dev/graphql';

// ─── Auth ───────────────────────────────────────────────────────────────────
const state = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
const SESSION_SECRET = state.auth?.sessionSecret;
if (!SESSION_SECRET) throw new Error('Not logged in to EAS. Run: eas login');

// ─── Service account key ────────────────────────────────────────────────────
const keyJson = JSON.parse(readFileSync(KEY_FILE, 'utf8'));

// ─── GraphQL helper ─────────────────────────────────────────────────────────
async function gql(query, variables = {}) {
  const res = await fetch(GQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'expo-session': SESSION_SECRET,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) {
    console.error('GraphQL errors:', JSON.stringify(json.errors, null, 2));
    throw new Error(json.errors[0].message);
  }
  return json.data;
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('🔑 Rotta Urbana — FCM V1 credential upload\n');

  // 1. Get account info
  console.log('1/4 Fetching account info…');
  const meData = await gql(`
    query Me {
      me {
        id
        username
        accounts {
          id
          name
        }
      }
    }
  `);
  const account = meData.me.accounts[0];
  console.log(`    Account: ${account.name} (${account.id})`);

  // 2. Create the Google Service Account Key credential
  console.log('2/4 Creating Google Service Account Key credential…');
  const createKeyData = await gql(`
    mutation CreateGoogleServiceAccountKeyMutation(
      $googleServiceAccountKeyInput: GoogleServiceAccountKeyInput!
      $accountId: ID!
    ) {
      googleServiceAccountKey {
        createGoogleServiceAccountKey(
          googleServiceAccountKeyInput: $googleServiceAccountKeyInput
          accountId: $accountId
        ) {
          id
          projectIdentifier
          clientEmail
        }
      }
    }
  `, {
    accountId: account.id,
    googleServiceAccountKeyInput: {
      jsonKey: keyJson,
    },
  });
  const googleKey = createKeyData.googleServiceAccountKey.createGoogleServiceAccountKey;
  console.log(`    Created key: ${googleKey.id} (${googleKey.clientEmail})`);

  // 3. Get or create AndroidAppCredentials
  console.log('3/4 Getting Android app credentials…');
  const appCredsData = await gql(`
    query AndroidAppCredentials($projectId: String!, $applicationIdentifier: String!) {
      app {
        byId(appId: $projectId) {
          id
          androidAppCredentials(filter: { applicationIdentifier: $applicationIdentifier }) {
            id
            applicationIdentifier
          }
        }
      }
    }
  `, {
    projectId: PROJECT_ID,
    applicationIdentifier: APP_PACKAGE,
  });

  const appId = appCredsData.app.byId.id;
  const existingCreds = appCredsData.app.byId.androidAppCredentials;
  let androidAppCredentialsId;

  if (existingCreds.length > 0) {
    androidAppCredentialsId = existingCreds[0].id;
    console.log(`    Using existing credentials: ${androidAppCredentialsId}`);
  } else {
    console.log('    No existing credentials, creating new…');
    const createCredsData = await gql(`
      mutation CreateAndroidAppCredentialsMutation(
        $androidAppCredentialsInput: AndroidAppCredentialsInput!
        $appId: ID!
        $applicationIdentifier: String!
      ) {
        androidAppCredentials {
          createAndroidAppCredentials(
            androidAppCredentialsInput: $androidAppCredentialsInput
            appId: $appId
            applicationIdentifier: $applicationIdentifier
          ) {
            id
          }
        }
      }
    `, {
      appId,
      applicationIdentifier: APP_PACKAGE,
      androidAppCredentialsInput: {},
    });
    androidAppCredentialsId = createCredsData.androidAppCredentials.createAndroidAppCredentials.id;
    console.log(`    Created credentials: ${androidAppCredentialsId}`);
  }

  // 4. Assign FCM V1 key
  console.log('4/4 Assigning FCM V1 key to app credentials…');
  await gql(`
    mutation SetGoogleServiceAccountKeyForFcmV1Mutation(
      $androidAppCredentialsId: ID!
      $googleServiceAccountKeyId: ID!
    ) {
      androidAppCredentials {
        setGoogleServiceAccountKeyForFcmV1(
          id: $androidAppCredentialsId
          googleServiceAccountKeyId: $googleServiceAccountKeyId
        ) {
          id
          applicationIdentifier
        }
      }
    }
  `, {
    androidAppCredentialsId,
    googleServiceAccountKeyId: googleKey.id,
  });

  console.log('\n✅ FCM V1 configurado com sucesso!');
  console.log('   Android push notifications agora vão funcionar mesmo com o app fechado.');
  console.log('   Nenhum novo build é necessário.\n');
}

main().catch(e => {
  console.error('\n❌ Erro:', e.message);
  process.exit(1);
});
