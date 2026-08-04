import axios, { AxiosError } from 'axios';
import { Router } from 'express';

export const adminVapiHealthRouter = Router();

type VapiResourceCheck = {
  ok: boolean;
  id: string;
  status?: number;
  error?: string;
};

function getRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} não configurada.`);
  }

  return value;
}

function getAxiosErrorMessage(error: unknown): {
  status?: number;
  message: string;
} {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<{
      message?: string;
      error?: string;
    }>;

    return {
      status: axiosError.response?.status,
      message:
        axiosError.response?.data?.message ||
        axiosError.response?.data?.error ||
        axiosError.message,
    };
  }

  return {
    message: error instanceof Error ? error.message : 'Erro desconhecido',
  };
}

adminVapiHealthRouter.get('/vapi/health', async (req, res) => {
  const configuredToken = process.env.ADMIN_MIGRATION_TOKEN;
  const providedToken = req.header('x-admin-token');

  if (!configuredToken || providedToken !== configuredToken) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  try {
    const apiKey = getRequiredEnv('VAPI_API_KEY');
    const phoneNumberId = getRequiredEnv('VAPI_PHONE_NUMBER_ID');
    const assistantId = getRequiredEnv('VAPI_ASSISTANT_ID_UVA');

    const client = axios.create({
      baseURL: 'https://api.vapi.ai',
      timeout: 10_000,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    const checkResource = async (
      path: string,
      id: string,
    ): Promise<VapiResourceCheck> => {
      try {
        const response = await client.get(path);

        return {
          ok: response.status >= 200 && response.status < 300,
          id,
          status: response.status,
        };
      } catch (error) {
        const details = getAxiosErrorMessage(error);

        return {
          ok: false,
          id,
          status: details.status,
          error: details.message,
        };
      }
    };

    const [phoneNumber, assistant] = await Promise.all([
      checkResource(`/phone-number/${phoneNumberId}`, phoneNumberId),
      checkResource(`/assistant/${assistantId}`, assistantId),
    ]);

    const ok = phoneNumber.ok && assistant.ok;

    return res.status(ok ? 200 : 502).json({
      ok,
      provider: 'vapi',
      operation: 'uva',
      checks: {
        apiKey: {
          ok: true,
          configured: true,
        },
        phoneNumber,
        assistant,
      },
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      provider: 'vapi',
      operation: 'uva',
      error: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
});