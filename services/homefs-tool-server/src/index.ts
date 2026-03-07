import 'dotenv/config';
import express from 'express';
import { z } from 'zod';
import { ConfigSchema } from './config';
import { tools } from './tools';
import {
  ListToolsResponseSchema,
  ToolCallRequestSchema,
  ToolCallResponseSchema,
} from 'homefs-shared';

const EmptyArgumentsSchema = z.object({}).strict();

const parseToolArguments = (
  argumentsValue: z.infer<typeof ToolCallRequestSchema>['tool_call']['function']['arguments'],
): unknown => {
  if (typeof argumentsValue === 'string') {
    try {
      return JSON.parse(argumentsValue);
    } catch {
      return null;
    }
  }

  return argumentsValue ?? {};
};

const main = (): void => {
  const app = express();
  app.use(express.json());

  app.get('/tools', (_req, res) => {
    const response = ListToolsResponseSchema.parse({ tools });
    res.json(response);
  });

  app.post('/tools/call', (req, res) => {
    const parseResult = ToolCallRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: 'Invalid request body',
        details: parseResult.error.flatten(),
      });
      return;
    }

    const toolCall = parseResult.data.tool_call;

    if (toolCall.function.name !== 'system.time') {
      res.status(400).json({ error: 'Unknown tool' });
      return;
    }

    const args = parseToolArguments(toolCall.function.arguments);
    const argsResult = EmptyArgumentsSchema.safeParse(args);
    if (!argsResult.success) {
      res.status(400).json({
        error: 'Invalid arguments for system.time',
        details: argsResult.error.flatten(),
      });
      return;
    }

    const response = ToolCallResponseSchema.parse({
      tool_name: toolCall.function.name,
      tool_call_id: toolCall.id,
      result: { time: new Date().toISOString() },
    });

    res.json(response);
  });

  const config = ConfigSchema.parse(process.env);
  const port = config.PORT ?? 3000;

  app.listen(port, () => {
    console.log(`homefs-tool-server listening on ${port}`);
  });
};

main();
