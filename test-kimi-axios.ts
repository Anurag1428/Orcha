import axios from 'axios';

const invokeUrl = "https://integrate.api.nvidia.com/v1/chat/completions";
const stream = true;

const headers = {
  "Authorization": "Bearer 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",
  "Accept": stream ? "text/event-stream" : "application/json"
};

const payload = {
  "model": "moonshotai/kimi-k2.6",
  "messages": [{"role":"user","content":"Say 'Axios works!' and nothing else."}],
  "max_tokens": 100,
  "temperature": 1.00,
  "top_p": 1.00,
  "stream": stream,
  "chat_template_kwargs": {"thinking":true},
};

console.log("Sending request via Axios...");

Promise.resolve(
  axios.post(invokeUrl, payload, {
    headers: headers,
    responseType: stream ? 'stream' : 'json'
  })
)
  .then(response => {
    if (stream) {
      response.data.on('data', (chunk: Buffer) => {
        console.log(chunk.toString());
      });
      response.data.on('end', () => {
        console.log("Stream ended.");
        process.exit(0);
      });
    } else {
      console.log(JSON.stringify(response.data));
      process.exit(0);
    }
  })
  .catch(error => {
    if (error.response) {
      console.error(`HTTP ${error.response.status}`);
      if (error.response.data?.on) {
        error.response.data.on('data', (chunk: Buffer) => console.error(chunk.toString()));
      } else {
        console.error(error.response.data);
      }
    } else {
      console.error(error);
    }
    process.exit(1);
  });
