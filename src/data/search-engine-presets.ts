import type { searchPresetSiteMessages } from '../i18n/search-presets';

export const SEARCH_ENGINE_PRESET_CATEGORIES = [
  'general', 'knowledge', 'media', 'shopping', 'development', 'news', 'cars',
] as const;

export interface SearchEnginePreset {
  readonly id: string;
  readonly nameKey: keyof typeof searchPresetSiteMessages;
  readonly category: typeof SEARCH_ENGINE_PRESET_CATEGORIES[number];
  readonly keyword: string;
  readonly urlTemplate: string;
  readonly restricted?: boolean;
}

// Candidates only: this catalog must never be used as the initial enabled list.
export const SEARCH_ENGINE_PRESETS: readonly SearchEnginePreset[] = [
  { id: 'se-baidu', nameKey: 'presetBaidu', category: 'general', keyword: 'bd', urlTemplate: 'https://www.baidu.com/s?wd={query}' },
  { id: 'se-bing', nameKey: 'presetBing', category: 'general', keyword: 'b', urlTemplate: 'https://www.bing.com/search?q={query}' },
  { id: 'se-google', nameKey: 'presetGoogle', category: 'general', keyword: 'g', urlTemplate: 'https://www.google.com/search?q={query}', restricted: true },
  { id: 'se-duckduckgo', nameKey: 'presetDuckduckgo', category: 'general', keyword: 'ddg', urlTemplate: 'https://duckduckgo.com/?q={query}', restricted: true },
  { id: 'se-sogou', nameKey: 'presetSogou', category: 'general', keyword: 'sg', urlTemplate: 'https://www.sogou.com/web?query={query}' },
  { id: 'se-360', nameKey: 'preset360', category: 'general', keyword: '360', urlTemplate: 'https://www.so.com/s?q={query}' },
  { id: 'se-yahoo', nameKey: 'presetYahoo', category: 'general', keyword: 'yahoo', urlTemplate: 'https://search.yahoo.com/search?p={query}', restricted: true },
  { id: 'se-shenma', nameKey: 'presetShenma', category: 'general', keyword: 'sm', urlTemplate: 'https://m.sm.cn/s?q={query}' },
  { id: 'se-zhihu', nameKey: 'presetZhihu', category: 'knowledge', keyword: 'zh', urlTemplate: 'https://www.zhihu.com/search?type=content&q={query}', restricted: true },
  { id: 'se-wiki', nameKey: 'presetWiki', category: 'knowledge', keyword: 'wk', urlTemplate: 'https://zh.wikipedia.org/wiki/Special:Search?search={query}', restricted: true },
  { id: 'se-baike', nameKey: 'presetBaike', category: 'knowledge', keyword: 'bk', urlTemplate: 'https://baike.baidu.com/search?word={query}' },
  { id: 'se-douban', nameKey: 'presetDouban', category: 'knowledge', keyword: 'db', urlTemplate: 'https://www.douban.com/search?q={query}', restricted: true },
  { id: 'se-wechat', nameKey: 'presetWechat', category: 'knowledge', keyword: 'wx', urlTemplate: 'https://weixin.sogou.com/weixin?type=2&query={query}', restricted: true },
  { id: 'se-scholar', nameKey: 'presetScholar', category: 'knowledge', keyword: 'scholar', urlTemplate: 'https://scholar.google.com/scholar?q={query}', restricted: true },
  { id: 'se-bilibili', nameKey: 'presetBilibili', category: 'media', keyword: 'bili', urlTemplate: 'https://search.bilibili.com/all?keyword={query}' },
  { id: 'se-youtube', nameKey: 'presetYoutube', category: 'media', keyword: 'yt', urlTemplate: 'https://www.youtube.com/results?search_query={query}', restricted: true },
  { id: 'se-douyin', nameKey: 'presetDouyin', category: 'media', keyword: 'dy', urlTemplate: 'https://www.douyin.com/search/{query}', restricted: true },
  { id: 'se-xiaohongshu', nameKey: 'presetXiaohongshu', category: 'media', keyword: 'xhs', urlTemplate: 'https://www.xiaohongshu.com/search_result?keyword={query}', restricted: true },
  { id: 'se-weibo', nameKey: 'presetWeibo', category: 'media', keyword: 'wb', urlTemplate: 'https://s.weibo.com/weibo?q={query}', restricted: true },
  { id: 'se-taobao', nameKey: 'presetTaobao', category: 'shopping', keyword: 'tb', urlTemplate: 'https://s.taobao.com/search?q={query}', restricted: true },
  { id: 'se-jd', nameKey: 'presetJd', category: 'shopping', keyword: 'jd', urlTemplate: 'https://search.jd.com/Search?keyword={query}&enc=utf-8', restricted: true },
  { id: 'se-tmall', nameKey: 'presetTmall', category: 'shopping', keyword: 'tm', urlTemplate: 'https://list.tmall.com/search_product.htm?q={query}', restricted: true },
  { id: 'se-amazon', nameKey: 'presetAmazon', category: 'shopping', keyword: 'amz', urlTemplate: 'https://www.amazon.com/s?k={query}', restricted: true },
  { id: 'se-github', nameKey: 'presetGithub', category: 'development', keyword: 'gh', urlTemplate: 'https://github.com/search?q={query}', restricted: true },
  { id: 'se-stackoverflow', nameKey: 'presetStackoverflow', category: 'development', keyword: 'so', urlTemplate: 'https://stackoverflow.com/search?q={query}', restricted: true },
  { id: 'se-mdn', nameKey: 'presetMdn', category: 'development', keyword: 'mdn', urlTemplate: 'https://developer.mozilla.org/zh-CN/search?q={query}' },
  { id: 'se-juejin', nameKey: 'presetJuejin', category: 'development', keyword: 'jj', urlTemplate: 'https://juejin.cn/search?query={query}' },
  { id: 'se-csdn', nameKey: 'presetCsdn', category: 'development', keyword: 'csdn', urlTemplate: 'https://so.csdn.net/so/search?q={query}' },
  { id: 'se-toutiao', nameKey: 'presetToutiao', category: 'news', keyword: 'tt', urlTemplate: 'https://so.toutiao.com/search/?keyword={query}', restricted: true },
  { id: 'se-dongchedi', nameKey: 'presetDongchedi', category: 'cars', keyword: 'dcd', urlTemplate: 'https://www.dongchedi.com/search?keyword={query}', restricted: true },
  { id: 'se-autohome', nameKey: 'presetAutohome', category: 'cars', keyword: 'autohome', urlTemplate: 'https://sou.autohome.com.cn/zonghe?q={query}' },
];
