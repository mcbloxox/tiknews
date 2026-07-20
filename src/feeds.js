// The news sources the pipeline reads.
// Add or remove lines here — nothing else needs to change.
// "name" is what appears on the card. "url" is the RSS feed address.

const FEEDS = [
  { name: 'Variety',            url: 'https://variety.com/feed/' },
  { name: 'Deadline',           url: 'https://deadline.com/feed/' },
  { name: 'The Hollywood Reporter', url: 'https://www.hollywoodreporter.com/feed/' },
  { name: 'Billboard',          url: 'https://www.billboard.com/feed/' },
  { name: 'BBC Entertainment',  url: 'https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml' },
  { name: 'AP Entertainment',   url: 'https://rsshub.app/apnews/topics/entertainment' },
];

module.exports = { FEEDS };
