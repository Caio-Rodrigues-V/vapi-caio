"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const axios_1 = __importDefault(require("axios"));
dotenv_1.default.config();
const { VAPI_API_KEY, VAPI_PHONE_NUMBER_ID, VAPI_ASSISTANT_ID, YOUR_PHONE_NUMBER } = process.env;
if (!VAPI_API_KEY || !VAPI_PHONE_NUMBER_ID || !VAPI_ASSISTANT_ID || !YOUR_PHONE_NUMBER) {
    console.error('Missing required environment variables in .env');
    console.error('Please ensure VAPI_API_KEY, VAPI_PHONE_NUMBER_ID, VAPI_ASSISTANT_ID, and YOUR_PHONE_NUMBER are set.');
    process.exit(1);
}
async function makeCall() {
    console.log(`Starting call to ${YOUR_PHONE_NUMBER}...`);
    try {
        const response = await axios_1.default.post('https://api.vapi.ai/call/phone', {
            phoneNumberId: VAPI_PHONE_NUMBER_ID,
            assistantId: VAPI_ASSISTANT_ID,
            customer: {
                number: YOUR_PHONE_NUMBER,
            },
        }, {
            headers: {
                Authorization: `Bearer ${VAPI_API_KEY}`,
                'Content-Type': 'application/json',
            },
        });
        console.log('Call initiated successfully!');
        console.log('Call ID:', response.data.id);
        console.log('Status:', response.data.status);
    }
    catch (error) {
        console.error('Error initiating call:');
        if (error.response) {
            console.error(error.response.data);
        }
        else {
            console.error(error.message);
        }
    }
}
makeCall();
//# sourceMappingURL=poc.js.map