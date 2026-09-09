'use strict';

// Pipeline stats now live in web/pipeline-stats.js (a dual-mode module, like
// web/timeline-scale.js) so the browser can recompute the strip over the
// visible row set without loading server code. This file is a thin
// re-export so existing `require('./stats')` callers (server.js,
// stats.test.js) keep working unchanged.
module.exports = require('../web/pipeline-stats.js');
