'use strict';

self.meta = document.querySelector('meta[name="Keywords"],meta[name="keywords"]');
self.description = document.querySelector('meta[name="Description"],meta[name="description"]');
self.link = document.querySelector('link[rel*="icon"]');


({
  body: document.body.innerText.trim(),
  date: new Date(document.lastModified).toISOString().split('T')[0].replace(/-/g, ''),
  description: self.description?.content || '',
  keywords: self.meta?.content || '',
  lang: document.documentElement.lang,
  mime: document.contentType,
  title: document.title,
  url: location.href,
  top: window.top === window,
  favIconUrl: self.link?.href || ''
  // eslint-disable-next-line semi
})
