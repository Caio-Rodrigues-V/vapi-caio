"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminVapiHealthRouter = void 0;
const axios_1 = __importDefault(require("axios"));
const express_1 = require("express");
exports.adminVapiHealthRouter = (0, express_1.Router)();
function getRequiredEnv(name) {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`${name} não configurada.`);
    }
    return value;
}
function getAxiosErrorMessage(error) {
    if (axios_1.default.isAxiosError(error)) {
        const axiosError = error;
        return {
            status: axiosError.response?.status,
            message: axiosError.response?.data?.message ||
                axiosError.response?.data?.error ||
                axiosError.message,
        };
    }
    return {
        message: error instanceof Error ? error.message : 'Erro desconhecido',
    };
}
exports.adminVapiHealthRouter.get('/vapi/health', async (req, res) => {
    const configuredToken = process.env.ADMIN_MIGRATION_TOKEN;
    const providedToken = req.header('x-admin-token');
    if (!configuredToken || providedToken !== configuredToken) {
        return res.status(401).json({ error: 'Não autorizado' });
    }
    try {
        const apiKey = getRequiredEnv('VAPI_API_KEY');
        const phoneNumberId = getRequiredEnv('VAPI_PHONE_NUMBER_ID');
        const assistantId = getRequiredEnv('VAPI_ASSISTANT_ID_UVA');
        const client = axios_1.default.create({
            baseURL: 'https://api.vapi.ai',
            timeout: 10_000,
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
        });
        const checkResource = async (path, id) => {
            try {
                const response = await client.get(path);
                return {
                    ok: response.status >= 200 && response.status < 300,
                    id,
                    status: response.status,
                };
            }
            catch (error) {
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
    }
    catch (error) {
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
//# sourceMappingURL=adminVapiHealth.js.map