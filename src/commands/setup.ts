import { defineCommand } from '../cli/index.js'
import { inputFile, operation } from './control.js'
export const setupCommand = defineCommand({
  name: 'setup',
  summary: 'Plan, apply or skip server setup',
  group: 'server',
  description:
    'The same durable operations as the wizard. Plan returns a digest; apply accepts {request,plan_digest,request_id}. Use control list for media and managed-engine setup operations.',
  subcommands: [
    defineCommand({
      name: 'plan',
      summary: 'Review a GGUF model and its dependencies',
      options: {
        input: {
          type: 'string',
          description: 'JSON or @file with repo, file and optional revision/projector choice',
        },
      },
      run: async (inv, ctx) => operation(ctx, 'models.plan', await inputFile(ctx, inv.values['input'])),
    }),
    defineCommand({
      name: 'apply',
      summary: 'Start exactly the reviewed durable installation',
      options: {
        'input': { type: 'string', description: 'JSON or @file with request, plan_digest and request_id' },
        'non-interactive': { type: 'boolean', description: 'Return errors for missing fields; never prompt' },
      },
      run: async (inv, ctx) => operation(ctx, 'models.install', await inputFile(ctx, inv.values['input'])),
    }),
    defineCommand({
      name: 'status',
      summary: 'Show durable installation progress',
      run: (_inv, ctx) => operation(ctx, 'setup.status'),
    }),
    defineCommand({
      name: 'manual',
      summary: 'Skip onboarding and keep manual setup available',
      run: (_inv, ctx) => operation(ctx, 'setup.manual'),
    }),
    defineCommand({
      name: 'complete',
      summary: 'Record setup after verifying a working API and model',
      run: (_inv, ctx) => operation(ctx, 'setup.complete'),
    }),
    ...['resume', 'cancel'].map((name) =>
      defineCommand({
        name,
        summary: `${name === 'resume' ? 'Resume' : 'Cancel'} a durable installation`,
        positionals: [{ name: 'id', description: 'Setup ID', required: true }],
        run: (inv, ctx) => operation(ctx, `setup.${name}`, { setup_id: inv.positionals[0] }),
      })
    ),
  ],
})
