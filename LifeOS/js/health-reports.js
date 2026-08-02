/* ============================================================
 * LifeOS 健康报告模块（health-reports.js）
 * 无构建步骤：IIFE + window.LifeOS.HealthReports / HealthReportEngine
 *
 * 隐私边界：PDF / 图片 / data URL 仅驻留当前页面内存并发送给用户配置的 AI。
 * IndexedDB 只保存用户确认后的结构化报告与指标。
 * ============================================================ */
(function () {
    'use strict';

    var LifeOS = window.LifeOS;
    if (!LifeOS) throw new Error('health-reports.js requires core.js');

    var Utils = LifeOS.Utils;
    var Database = LifeOS.Database;
    var AIClient = LifeOS.AIClient;
    var STORE = 'nutrition';
    var MAX_FILE_BYTES = 10 * 1024 * 1024;
    var MAX_PDF_PAGES = 20;
    var MAX_IMAGE_FILES = 5;

    function text(value, max) {
        return String(value === undefined || value === null ? '' : value).trim().slice(0, max || 240);
    }

    function num(value) {
        if (value === '' || value === null || value === undefined) return null;
        var parsed = Number(String(value).replace(/,/g, ''));
        return Number.isFinite(parsed) ? parsed : null;
    }

    function clamp(value, min, max, fallback) {
        var parsed = Number(value);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.min(max, Math.max(min, parsed));
    }

    function parseObject(raw) {
        if (raw && typeof raw === 'object') return raw;
        var parsed = Utils.parseJSONSafe(String(raw || ''), null);
        if (!parsed || typeof parsed !== 'object') throw new Error('AI 返回内容不是有效 JSON 对象');
        return parsed;
    }

    function validDate(value) {
        var match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
        return match ? match[0] : '';
    }

    var METRIC_ALIASES = {
        '体重': 'weight_kg', '体质量': 'weight_kg', 'weight': 'weight_kg',
        '体脂率': 'body_fat_pct', '体脂肪率': 'body_fat_pct', 'bodyfat': 'body_fat_pct',
        '身体质量指数': 'bmi', '体质指数': 'bmi', 'bmi': 'bmi',
        '骨骼肌量': 'skeletal_muscle_kg', '肌肉量': 'muscle_kg',
        '内脏脂肪等级': 'visceral_fat_level', '内脏脂肪': 'visceral_fat_level',
        '腰围': 'waist_cm', '收缩压': 'systolic_bp', '舒张压': 'diastolic_bp',
        '心率': 'heart_rate', '静息心率': 'resting_heart_rate',
        '空腹血糖': 'fasting_glucose', '血糖': 'glucose',
        '糖化血红蛋白': 'hba1c', '总胆固醇': 'total_cholesterol',
        '甘油三酯': 'triglycerides', '低密度脂蛋白': 'ldl_c',
        '低密度脂蛋白胆固醇': 'ldl_c', '高密度脂蛋白': 'hdl_c',
        '高密度脂蛋白胆固醇': 'hdl_c', '尿酸': 'uric_acid',
        '肌酐': 'creatinine', '丙氨酸氨基转移酶': 'alt', '谷丙转氨酶': 'alt',
        '天门冬氨酸氨基转移酶': 'ast', '谷草转氨酶': 'ast',
        '白细胞计数': 'wbc', '红细胞计数': 'rbc', '血红蛋白': 'hemoglobin',
        '血小板计数': 'platelets', '维生素d': 'vitamin_d'
    };

    function canonicalMetricKey(name) {
        var normalized = text(name, 80).toLowerCase().replace(/[\s·()（）_\-]/g, '');
        if (METRIC_ALIASES[normalized]) return METRIC_ALIASES[normalized];
        return 'metric_' + normalized.replace(/[^a-z0-9\u4e00-\u9fa5]/g, '').slice(0, 40);
    }

    function normalizeFlag(flag) {
        var value = String(flag || '').toLowerCase();
        if (['high', '偏高', '升高', '↑'].includes(value)) return 'high';
        if (['low', '偏低', '降低', '↓'].includes(value)) return 'low';
        if (['normal', '正常', '阴性'].includes(value)) return 'normal';
        if (['critical', '危急', '危急值'].includes(value)) return 'critical';
        return 'unknown';
    }

    function normalizeAdviceLevel(level, flag) {
        var value = String(level || '').toLowerCase();
        if (value === 'followup' || value === '复查' || flag === 'critical') return 'followup';
        if (value === 'attention' || value === '关注' || flag === 'high' || flag === 'low') return 'attention';
        if (value === 'normal' || flag === 'normal') return 'normal';
        return 'unknown';
    }

    function normalizeMetric(source, index) {
        source = source || {};
        var name = text(source.name || source.metric || source.item || '未命名指标', 80);
        var valueText = text(source.valueText !== undefined ? source.valueText : source.value, 60);
        var numericValue = num(source.numericValue !== undefined ? source.numericValue : valueText);
        var flag = normalizeFlag(source.flag || source.status || source.direction);
        return {
            id: text(source.id, 80) || ('metric-' + index + '-' + Utils.generateId().slice(0, 8)),
            key: text(source.key, 80) || canonicalMetricKey(name),
            name: name,
            value: valueText,
            numericValue: numericValue,
            unit: text(source.unit, 32),
            referenceLow: num(source.referenceLow),
            referenceHigh: num(source.referenceHigh),
            referenceText: text(source.referenceText || source.reference || source.range, 100),
            flag: flag,
            adviceLevel: normalizeAdviceLevel(source.adviceLevel || source.level, flag),
            page: Math.max(1, Math.round(clamp(source.page, 1, MAX_PDF_PAGES, 1))),
            evidence: text(source.evidence || source.originalText, 180),
            explanation: text(source.explanation || source.note, 240),
            confidence: clamp(source.confidence, 0, 1, 0.7)
        };
    }

    function normalizeReportType(value) {
        var type = String(value || '').toLowerCase();
        return ['physical_exam', 'lab', 'body_scale', 'other'].includes(type) ? type : 'other';
    }

    var HealthReportEngine = {
        canonicalMetricKey: canonicalMetricKey,

        parseAnalysis: function (raw) {
            var obj = parseObject(raw);
            var sourceMetrics = Array.isArray(obj.metrics) ? obj.metrics : (Array.isArray(obj.items) ? obj.items : []);
            return {
                reportType: normalizeReportType(obj.reportType || obj.type),
                title: text(obj.title || obj.reportName || '健康报告', 100),
                reportDate: validDate(obj.reportDate || obj.date),
                provider: text(obj.provider || obj.institution, 100),
                device: text(obj.device || obj.deviceName, 100),
                metrics: sourceMetrics.map(normalizeMetric).filter(function (metric) {
                    return metric.name && metric.value !== '';
                }).slice(0, 200),
                summary: text(obj.summary || obj.overview, 600),
                concerns: (Array.isArray(obj.concerns) ? obj.concerns : []).map(function (v) { return text(v, 180); }).filter(Boolean).slice(0, 8),
                suggestions: (Array.isArray(obj.suggestions) ? obj.suggestions : []).map(function (v) { return text(v, 180); }).filter(Boolean).slice(0, 8),
                confidence: clamp(obj.confidence, 0, 1, 0.7)
            };
        },

        mergeAnalyses: function (reports) {
            var valid = (reports || []).filter(Boolean);
            if (!valid.length) throw new Error('没有可合并的报告解析结果');
            var first = valid[0];
            var seen = new Set();
            var metrics = [];
            valid.forEach(function (report) {
                (report.metrics || []).forEach(function (metric) {
                    var signature = [metric.key, metric.value, metric.unit, metric.page].join('|');
                    if (!seen.has(signature)) {
                        seen.add(signature);
                        metrics.push(metric);
                    }
                });
            });
            return {
                reportType: valid.find(function (v) { return v.reportType !== 'other'; })?.reportType || first.reportType,
                title: valid.find(function (v) { return v.title && v.title !== '健康报告'; })?.title || first.title,
                reportDate: valid.find(function (v) { return v.reportDate; })?.reportDate || '',
                provider: valid.find(function (v) { return v.provider; })?.provider || '',
                device: valid.find(function (v) { return v.device; })?.device || '',
                metrics: metrics,
                summary: valid.map(function (v) { return v.summary; }).filter(Boolean).join('；').slice(0, 600),
                concerns: Array.from(new Set(valid.flatMap(function (v) { return v.concerns || []; }))).slice(0, 8),
                suggestions: Array.from(new Set(valid.flatMap(function (v) { return v.suggestions || []; }))).slice(0, 8),
                confidence: Math.min.apply(Math, valid.map(function (v) { return v.confidence || 0.7; }))
            };
        },

        overview: function (reports) {
            var counts = { normal: 0, attention: 0, followup: 0, unknown: 0 };
            (reports || []).forEach(function (report) {
                (report.metrics || []).forEach(function (metric) {
                    var level = normalizeAdviceLevel(metric.adviceLevel, metric.flag);
                    counts[level] = (counts[level] || 0) + 1;
                });
            });
            return counts;
        },

        trend: function (reports, metricKey) {
            return (reports || []).flatMap(function (report) {
                return (report.metrics || []).filter(function (metric) {
                    return metric.key === metricKey && Number.isFinite(metric.numericValue);
                }).map(function (metric) {
                    return { date: report.date, value: metric.numericValue, unit: metric.unit, reportId: report.id };
                });
            }).sort(function (a, b) { return a.date.localeCompare(b.date); });
        },

        messages: function (batch) {
            var prompt = [
                '你是谨慎的健康报告结构化助手。只提取材料中明确出现的信息，不诊断疾病，不补造缺失数值。',
                '必须只返回 JSON 对象：',
                '{"reportType":"physical_exam|lab|body_scale|other","title":"报告名称","reportDate":"YYYY-MM-DD或空字符串","provider":"机构","device":"设备","metrics":[{"name":"指标","value":"原值","numericValue":1.2,"unit":"单位","referenceLow":0,"referenceHigh":2,"referenceText":"原参考范围","flag":"high|low|normal|critical|unknown","adviceLevel":"normal|attention|followup|unknown","page":1,"evidence":"原文短句","explanation":"通俗但谨慎的说明","confidence":0.8}],"summary":"通俗摘要","concerns":[],"suggestions":[],"confidence":0.8}',
                '只有报告明确标为危急值时才能使用 critical；超出参考范围通常标 attention。建议复查必须使用“建议咨询医生/结合实际情况复查”等谨慎措辞。',
                '材料批次：' + text(batch.label || '', 80)
            ].join('\n');
            if (batch.kind === 'text') {
                return [{ role: 'user', content: prompt + '\n\n报告文字：\n' + String(batch.text || '').slice(0, 24000) }];
            }
            var content = [{ type: 'text', text: prompt }];
            (batch.images || []).forEach(function (url) {
                content.push({ type: 'image_url', image_url: { url: url } });
            });
            return [{ role: 'user', content: content }];
        }
    };

    async function blobToDataUrl(blob) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () { resolve(reader.result); };
            reader.onerror = function () { reject(reader.error || new Error('读取图片失败')); };
            reader.readAsDataURL(blob);
        });
    }

    async function decodeTiff(file) {
        if (!window.UTIF) throw new Error('TIFF 解码器未加载，请刷新页面后重试');
        var buffer = await file.arrayBuffer();
        var ifds = window.UTIF.decode(buffer);
        var output = [];
        for (var i = 0; i < Math.min(ifds.length, MAX_IMAGE_FILES); i++) {
            window.UTIF.decodeImage(buffer, ifds[i]);
            var rgba = window.UTIF.toRGBA8(ifds[i]);
            var canvas = document.createElement('canvas');
            canvas.width = ifds[i].width;
            canvas.height = ifds[i].height;
            var ctx = canvas.getContext('2d');
            var imageData = ctx.createImageData(canvas.width, canvas.height);
            imageData.data.set(rgba);
            ctx.putImageData(imageData, 0, 0);
            output.push(await LifeOS.Utils.compressImage(canvas.toDataURL('image/png'), 1600, 0.76));
        }
        return output;
    }

    async function decodeImageFile(file) {
        var ext = (file.name.split('.').pop() || '').toLowerCase();
        if (ext === 'heic' || ext === 'heif' || /hei[cf]/i.test(file.type)) {
            if (!window.heic2any) throw new Error('HEIC 解码器未加载，请刷新页面后重试');
            var converted = await window.heic2any({ blob: file, toType: 'image/jpeg', quality: 0.84 });
            var blob = Array.isArray(converted) ? converted[0] : converted;
            return [await LifeOS.Utils.compressImage(await blobToDataUrl(blob), 1600, 0.76)];
        }
        if (ext === 'tif' || ext === 'tiff' || /tiff/i.test(file.type)) return decodeTiff(file);
        return [await LifeOS.Utils.compressImage(await blobToDataUrl(file), 1600, 0.76)];
    }

    async function renderPdfPage(page) {
        var viewport = page.getViewport({ scale: 1.8 });
        var scale = Math.min(1, 1600 / viewport.width);
        if (scale < 1) viewport = page.getViewport({ scale: 1.8 * scale });
        var canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;
        return canvas.toDataURL('image/jpeg', 0.72);
    }

    var HealthReportFiles = {
        accept: '.pdf,.jpg,.jpeg,.png,.webp,.gif,.bmp,.heic,.heif,.tif,.tiff,image/*,application/pdf',

        validate: function (files) {
            files = Array.from(files || []);
            if (!files.length) throw new Error('请选择 PDF 或报告图片');
            if (files.some(function (file) { return file.size > MAX_FILE_BYTES; })) throw new Error('单个文件不能超过 10MB');
            var pdfs = files.filter(function (file) { return file.type === 'application/pdf' || /\.pdf$/i.test(file.name); });
            if (pdfs.length) {
                if (files.length !== 1) throw new Error('PDF 请单独上传，一次只解析一份报告');
                return { kind: 'pdf', files: files };
            }
            if (files.length > MAX_IMAGE_FILES) throw new Error('同一报告最多选择 5 张图片');
            return { kind: 'images', files: files };
        },

        prepare: async function (files, onProgress) {
            var checked = this.validate(files);
            var progress = typeof onProgress === 'function' ? onProgress : function () {};
            if (checked.kind === 'images') {
                var images = [];
                for (var i = 0; i < checked.files.length; i++) {
                    progress('正在处理图片 ' + (i + 1) + '/' + checked.files.length + '…');
                    images = images.concat(await decodeImageFile(checked.files[i]));
                }
                return {
                    sourceType: 'images', pageCount: images.length,
                    batches: chunk(images, 2).map(function (items, index) {
                        return { kind: 'images', images: items, label: '图片批次 ' + (index + 1) };
                    })
                };
            }
            if (!window.pdfjsLib) throw new Error('PDF 解析器未加载，请刷新页面后重试');
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';
            progress('正在读取 PDF…');
            var pdf = await window.pdfjsLib.getDocument({ data: await checked.files[0].arrayBuffer() }).promise;
            if (pdf.numPages > MAX_PDF_PAGES) throw new Error('PDF 最多支持 20 页，请拆分后再上传');
            var textPages = [];
            var imagePages = [];
            for (var pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
                progress('正在预处理 PDF 第 ' + pageNo + '/' + pdf.numPages + ' 页…');
                var page = await pdf.getPage(pageNo);
                var content = await page.getTextContent();
                var pageText = content.items.map(function (item) { return item.str; }).join(' ').replace(/\s+/g, ' ').trim();
                if (pageText.length >= 80) textPages.push({ page: pageNo, text: '[第' + pageNo + '页] ' + pageText });
                else imagePages.push({ page: pageNo, image: await renderPdfPage(page) });
            }
            var batches = chunk(textPages, 4).map(function (items, index) {
                return { kind: 'text', text: items.map(function (v) { return v.text; }).join('\n'), label: 'PDF 文字批次 ' + (index + 1) };
            });
            batches = batches.concat(chunk(imagePages, 2).map(function (items, index) {
                return { kind: 'images', images: items.map(function (v) { return v.image; }), label: 'PDF 扫描页批次 ' + (index + 1) };
            }));
            return { sourceType: 'pdf', pageCount: pdf.numPages, batches: batches };
        }
    };

    function chunk(items, size) {
        var output = [];
        for (var i = 0; i < items.length; i += size) output.push(items.slice(i, i + size));
        return output;
    }

    var HealthReports = {
        analyzePrepared: async function (prepared, onProgress) {
            var results = [];
            for (var i = 0; i < prepared.batches.length; i++) {
                if (onProgress) onProgress('AI 正在解析第 ' + (i + 1) + '/' + prepared.batches.length + ' 批…');
                var response = await AIClient.chat({
                    messages: HealthReportEngine.messages(prepared.batches[i]),
                    responseFormat: { type: 'json_object' },
                    temperature: 0.1,
                    maxTokens: 3500
                });
                results.push(HealthReportEngine.parseAnalysis(AIClient.extractText(response)));
            }
            var merged = HealthReportEngine.mergeAnalyses(results);
            merged.sourceType = prepared.sourceType;
            merged.pageCount = prepared.pageCount;
            return merged;
        },

        saveReport: async function (input) {
            input = input || {};
            var now = Utils.now();
            var reportDate = validDate(input.reportDate || input.date) || Utils.formatDate();
            var metrics = (input.metrics || []).map(normalizeMetric).filter(function (metric) { return metric.name && metric.value !== ''; });
            if (!metrics.length) throw new Error('至少保留一个已核对指标');
            var record = {
                id: input.id || Utils.generateId(),
                kind: 'healthReport',
                date: reportDate,
                weekStart: '',
                reportType: normalizeReportType(input.reportType),
                title: text(input.title || '健康报告', 100),
                provider: text(input.provider, 100),
                device: text(input.device, 100),
                sourceType: input.sourceType === 'pdf' ? 'pdf' : 'images',
                pageCount: Math.max(1, Math.round(clamp(input.pageCount, 1, MAX_PDF_PAGES, 1))),
                metrics: metrics,
                summary: text(input.summary, 600),
                concerns: (input.concerns || []).map(function (v) { return text(v, 180); }).filter(Boolean).slice(0, 8),
                suggestions: (input.suggestions || []).map(function (v) { return text(v, 180); }).filter(Boolean).slice(0, 8),
                confidence: clamp(input.confidence, 0, 1, 0.7),
                createdAt: input.createdAt || now
            };
            await Database.put(STORE, record);
            return record;
        },

        getReports: async function () {
            var rows = await Database.getByIndex(STORE, 'kind', 'healthReport');
            return rows.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
        },

        deleteReport: async function (id) {
            return Database.delete(STORE, id);
        },

        getTrend: async function (key) {
            return HealthReportEngine.trend(await this.getReports(), key);
        }
    };

    LifeOS.HealthReportEngine = HealthReportEngine;
    LifeOS.HealthReportFiles = HealthReportFiles;
    LifeOS.HealthReports = HealthReports;
    console.log('[LifeOS] health-reports.js 加载完成 ✓');
})();
