# Third-party notices — OneTap AI Team Room

This app loads the following open-source libraries. Each remains under its own
license; nothing here changes those terms. Files are vendored unmodified.

| Library | Version | License | Vendored file |
|---|---|---|---|
| zod | 4.6.7 | MIT | `engines/zod.js` |
## License texts


### MIT — zod

```
MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 무료 AI 체험 서버

`engines/free-ai-client.js`는 이 저장소의 Cloudflare Worker
(`free-ai-taste.onetap-ai.workers.dev`)를 호출하는 클라이언트입니다.
이 파일은 이 프로젝트의 코드이며, 외부 라이브러리를 포함하지 않습니다.
무료 체험은 외부 AI 제공자(Cloudflare Workers AI / Google Gemini / Groq)로
전송되며, 앱은 그 사실을 화면에 안내합니다.
