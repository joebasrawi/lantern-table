import ts from 'typescript';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
mkdirSync('.test-build', { recursive: true });
for (const name of [
  'types',
  'attention',
  'engine',
  'dm-output',
  'portrait',
  'scheduler',
  'context',
  'draft',
]) {
  const source = readFileSync(`lib/game/${name}.ts`, 'utf8');
  const code = ts
    .transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    })
    .outputText.replace(/from '\.\/(types|engine|context)'/g, "from './$1.js'");
  writeFileSync(`.test-build/${name}.js`, code);
}

const authSource = readFileSync('lib/access-auth.ts', 'utf8');
writeFileSync(
  '.test-build/access-auth.js',
  ts.transpileModule(authSource, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText,
);

mkdirSync('.test-build/railway', { recursive: true });
for (const name of ['storage', 'auth', 'recovery', 'signup']) {
  writeFileSync(
    `.test-build/railway/${name}.js`,
    ts
      .transpileModule(readFileSync(`lib/railway/${name}.ts`, 'utf8'), {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
        },
      })
      .outputText.replace("from './storage'", "from './storage.js'")
      .replace("from './recovery'", "from './recovery.js'")
      .replace("from './signup'", "from './signup.js'"),
  );
}

writeFileSync(
  '.test-build/action-drafts.js',
  ts.transpileModule(readFileSync('lib/action-drafts.ts', 'utf8'), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText,
);
