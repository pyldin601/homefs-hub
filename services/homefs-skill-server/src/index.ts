import 'dotenv/config';
import { ConfigSchema } from './config';
import express from 'express';
import { z } from 'zod';
import { skills } from './skills';

const main = (): void => {
  const app = express();
  app.use(express.json());

  const ToolCallSchema = z.object({
    command: z.string().min(1),
    args: z.record(z.unknown()).optional(),
  });

  app.get('/skills', (_req, res) => {
    res.json({ skills });
  });

  app.post('/skills/call', (req, res) => {
    const parseResult = ToolCallSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: 'Invalid request body',
        details: parseResult.error.flatten(),
      });
      return;
    }

    const { command } = parseResult.data;

    if (command !== 'system.time') {
      res.status(400).json({ error: 'Unknown command' });
      return;
    }

    res.json({ result: { time: new Date().toISOString() } });
  });

  const config = ConfigSchema.parse(process.env);

  const port = config.PORT ?? 3000;

  app.listen(port, () => {
    console.log(`homefs-skill-server listening on ${port}`);
  });
};

main();
