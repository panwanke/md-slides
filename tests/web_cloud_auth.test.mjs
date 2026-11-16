import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('../web/node_modules/typescript/lib/typescript.js');

const clientSourcePath = new URL('../web/src/cloud/client.ts', import.meta.url);

function plainUser(value) {
  if (!value) return value;
  return {
    id: value.id,
    email: value.email,
    name: value.name,
    displayName: value.displayName,
    createdAt: value.createdAt,
  };
}

async function loadNormalizeUser() {
  const source = await readFile(clientSourcePath, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });

  const sandbox = {
    exports: {},
    require(request) {
      if (request.includes('workbuddy-cloud-sdk')) {
        return { createWorkBuddyCloud: () => ({}) };
      }
      if (request.endsWith('publicConfig')) {
        return {
          publicConfig: { endpoint: '', oauthRelayBaseUrl: '', publishableKey: '' },
          isCloudRuntime: () => false,
        };
      }
      return {};
    },
  };
  vm.runInNewContext(outputText, sandbox, { filename: clientSourcePath.pathname });
  return sandbox.exports.normalizeUser;
}

test('normalizeUser accepts the SDK CloudUser object passed by sessionUser', async () => {
  const normalizeUser = await loadNormalizeUser();

  const result = normalizeUser({
    id: 'usr_phone_login',
    name: 'Wanke',
    phone: '19272453239',
  });

  assert.deepEqual(plainUser(result), {
    id: 'usr_phone_login',
    email: undefined,
    name: 'Wanke',
    displayName: 'Wanke',
    createdAt: undefined,
  });
});

test('normalizeUser accepts the SDK session shape returned by getSession', async () => {
  const normalizeUser = await loadNormalizeUser();

  const result = normalizeUser({
    accessToken: 'token',
    refreshToken: 'refresh',
    expiresAt: 1,
    user: { id: 'usr_session', name: '潘晚坷' },
  });

  assert.deepEqual(plainUser(result), {
    id: 'usr_session',
    email: undefined,
    name: '潘晚坷',
    displayName: '潘晚坷',
    createdAt: undefined,
  });
});
