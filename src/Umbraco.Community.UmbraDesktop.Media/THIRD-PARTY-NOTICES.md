# Third-party notices

The UmbraDesktop Media Add-on is licensed under the MIT License (see `LICENSE` in the repository).
It includes the third-party software below, which keeps its own licence.

The build checks this file: every npm package in the built JavaScript must be named here at the
version it was built with, and must be MIT, Apache-2.0, BSD or ISC licensed, or the build fails
(`backoffice/vite.config.ts`). Each built file that contains one of them also starts with its notice.

## Fabric.js

The Image Editor's canvas: the picture, its live adjustment, zoom and pan, the crop frame, the
marks and the redaction regions.

- fabric@7.4.0
- https://github.com/fabricjs/fabric.js
- Copyright (c) 2008-2015 Printio (Juriy Zaytsev, Maxim Chernyak)
- Copyright (c) 2016-present Andrea Bogazzi, Shachar Nen and Fabric.js contributors
- Licensed under the MIT License, reproduced in full below

Fabric's optional dependencies, `jsdom` and `canvas`, are for Node and are not in the built files.

---

MIT License

Copyright (c) 2008-2015 Printio (Juriy Zaytsev, Maxim Chernyak)
Copyright (c) 2016-present Andrea Bogazzi, Shachar Nen and Fabric.js contributors (https://github.com/fabricjs/fabric.js/graphs/contributors)

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
