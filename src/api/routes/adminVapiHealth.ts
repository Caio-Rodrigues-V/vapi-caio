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
    const apiKey = process.env.DIALOG_DDM_API_KEY || getRequiredEnv('VAPI_API_KEY');
    const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID || 'oktor_sip_500ch';
    const assistantId = process.env.DEFAULT_ASSISTANT_ID || process.env.VAPI_ASSISTANT_ID_UVA || '2';

    const client = axios.create({
      baseURL: process.env.DIALOG_DDM_BASE_URL || process.env.VAPI_BASE_URL || 'https://dialddm.grupoddm.ia.br/v1',
      timeout: 25_000,
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

    const unauthorized = phoneNumber.status === 401 || assistant.status === 401;
    const ok = phoneNumber.ok && assistant.ok;

    return res.status(ok ? 200 : unauthorized ? 401 : 502).json({
      ok,
      provider: 'vapi',
      operation: 'uva',
      checks: {
        apiKey: {
          ok: !unauthorized,
          configured: true,
        },
        phoneNumber,
        assistant,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    const configurationError = message.includes('não configurada');

    return res.status(configurationError ? 503 : 500).json({
      ok: false,
      provider: 'vapi',
      operation: 'uva',
      error: message,
    });
  }
});

adminVapiHealthRouter.get('/version', (_req, res) => {
  return res.json({
    ok: true,
    version: '2026-08-07.v2_smart_csv',
    buildDate: new Date().toISOString(),
  });
});
