import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const { VAPI_API_KEY, VAPI_PHONE_NUMBER_ID, VAPI_ASSISTANT_ID, YOUR_PHONE_NUMBER } = process.env;

if (!VAPI_API_KEY || !VAPI_PHONE_NUMBER_ID || !VAPI_ASSISTANT_ID || !YOUR_PHONE_NUMBER) {
  console.error('Missing required environment variables in .env');
  console.error('Please ensure VAPI_API_KEY, VAPI_PHONE_NUMBER_ID, VAPI_ASSISTANT_ID, and YOUR_PHONE_NUMBER are set.');
  process.exit(1);
}

async function makeCall() {
  console.log(`Starting call to ${YOUR_PHONE_NUMBER}...`);

  try {
    const baseUrl = (process.env.DIALOG_DDM_BASE_URL || process.env.VAPI_BASE_URL || 'https://dialddm.grupoddm.ia.br/v1').replace(/\/$/, '');
    const response = await axios.post(
      `${baseUrl}/call/phone`,
      {
        phoneNumberId: VAPI_PHONE_NUMBER_ID,
        assistantId: VAPI_ASSISTANT_ID,
        customer: {
          number: YOUR_PHONE_NUMBER,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${VAPI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log('Call initiated successfully!');
    console.log('Call ID:', response.data.id);
    console.log('Status:', response.data.status);
  } catch (error: any) {
    console.error('Error initiating call:');
    if (error.response) {
      console.error(error.response.data);
    } else {
      console.error(error.message);
    }
  }
}

makeCall();
