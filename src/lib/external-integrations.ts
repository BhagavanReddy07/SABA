export interface WeatherData {
  temperature: number;
  condition: string;
  location: string;
  humidity: number;
  windSpeed: number;
}

export interface CalendarEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  location?: string;
  description?: string;
}

export interface NewsArticle {
  title: string;
  summary: string;
  source: string;
  publishedAt: string;
  url: string;
}

export class ExternalIntegrations {
  private static instance: ExternalIntegrations;

  static getInstance(): ExternalIntegrations {
    if (!ExternalIntegrations.instance) {
      ExternalIntegrations.instance = new ExternalIntegrations();
    }
    return ExternalIntegrations.instance;
  }

  // Weather Integration (using a free weather API)
  async getWeather(location: string): Promise<WeatherData | null> {
    try {
      // For demo purposes, we'll simulate weather data
      // In a real implementation, you would call a weather API like OpenWeatherMap
      console.log(`Fetching weather for: ${location}`);

      // Simulated weather data
      const conditions = ['Sunny', 'Cloudy', 'Rainy', 'Partly Cloudy', 'Clear'];
      const randomCondition = conditions[Math.floor(Math.random() * conditions.length)];

      return {
        temperature: Math.floor(Math.random() * 30) + 10, // 10-40°C
        condition: randomCondition,
        location: location,
        humidity: Math.floor(Math.random() * 60) + 30, // 30-90%
        windSpeed: Math.floor(Math.random() * 20) + 5 // 5-25 km/h
      };
    } catch (error) {
      console.error('Error fetching weather:', error);
      return null;
    }
  }

  // Calendar Integration (simulated for demo)
  async getUpcomingEvents(limit: number = 5): Promise<CalendarEvent[]> {
    try {
      // Simulated calendar events
      const events: CalendarEvent[] = [
        {
          id: '1',
          title: 'Team Meeting',
          startTime: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2 hours from now
          endTime: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
          location: 'Conference Room A',
          description: 'Weekly team sync meeting'
        },
        {
          id: '2',
          title: 'Project Deadline',
          startTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
          endTime: new Date(Date.now() + 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString(),
          description: 'Final project submission deadline'
        },
        {
          id: '3',
          title: 'Lunch with Client',
          startTime: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), // Day after tomorrow
          endTime: new Date(Date.now() + 48 * 60 * 60 * 1000 + 90 * 60 * 1000).toISOString(),
          location: 'Downtown Restaurant',
          description: 'Client meeting and lunch'
        }
      ];

      return events.slice(0, limit);
    } catch (error) {
      console.error('Error fetching calendar events:', error);
      return [];
    }
  }

  // News Integration (simulated for demo)
  async getLatestNews(topic?: string, limit: number = 5): Promise<NewsArticle[]> {
    try {
      // Simulated news articles
      const articles: NewsArticle[] = [
        {
          title: 'AI Technology Advances in 2024',
          summary: 'Recent breakthroughs in artificial intelligence are transforming industries worldwide...',
          source: 'Tech News Daily',
          publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          url: 'https://example.com/ai-advances-2024'
        },
        {
          title: 'Climate Change Summit Results',
          summary: 'World leaders agree on new climate action targets in recent summit...',
          source: 'Global News Network',
          publishedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
          url: 'https://example.com/climate-summit-2024'
        },
        {
          title: 'Space Exploration Milestones',
          summary: 'New discoveries from recent Mars mission reveal exciting findings...',
          source: 'Science Today',
          publishedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
          url: 'https://example.com/space-milestones-2024'
        }
      ];

      // Filter by topic if provided
      let filteredArticles = articles;
      if (topic) {
        filteredArticles = articles.filter(article =>
          article.title.toLowerCase().includes(topic.toLowerCase()) ||
          article.summary.toLowerCase().includes(topic.toLowerCase())
        );
      }

      return filteredArticles.slice(0, limit);
    } catch (error) {
      console.error('Error fetching news:', error);
      return [];
    }
  }

  // Time and Date Utilities
  async getCurrentTime(timezone?: string): Promise<string> {
    try {
      // For demo, we'll return current time
      // In a real implementation, you could use timezone APIs
      const now = new Date();
      return now.toLocaleString(timezone ? undefined : 'en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch (error) {
      console.error('Error getting current time:', error);
      return new Date().toLocaleString();
    }
  }

  // Currency Conversion (simulated)
  async convertCurrency(amount: number, fromCurrency: string, toCurrency: string): Promise<number | null> {
    try {
      // Simulated exchange rates (in a real app, you'd use a currency API)
      const exchangeRates: Record<string, number> = {
        'USD': 1.0,
        'EUR': 0.85,
        'GBP': 0.73,
        'JPY': 110.0,
        'CAD': 1.25,
        'AUD': 1.35
      };

      const fromRate = exchangeRates[fromCurrency.toUpperCase()] || 1;
      const toRate = exchangeRates[toCurrency.toUpperCase()] || 1;

      if (fromRate === 1 && toRate === 1) {
        return null; // Unknown currencies
      }

      // Convert to USD first, then to target currency
      const usdAmount = amount / fromRate;
      const convertedAmount = usdAmount * toRate;

      return Math.round(convertedAmount * 100) / 100; // Round to 2 decimal places
    } catch (error) {
      console.error('Error converting currency:', error);
      return null;
    }
  }

  // Dictionary/Language Services (simulated)
  async getDefinition(word: string): Promise<string | null> {
    try {
      // Simulated dictionary definitions
      const definitions: Record<string, string> = {
        'artificial': 'Made or produced by human beings rather than occurring naturally.',
        'intelligence': 'The ability to acquire and apply knowledge and skills.',
        'machine': 'A device that performs work using power from electricity or another source.',
        'learning': 'The acquisition of knowledge or skills through experience or study.',
        'algorithm': 'A process or set of rules to be followed in calculations or problem-solving operations.'
      };

      return definitions[word.toLowerCase()] || null;
    } catch (error) {
      console.error('Error getting definition:', error);
      return null;
    }
  }

  // Stock/Financial Data (simulated)
  async getStockPrice(symbol: string): Promise<{ symbol: string; price: number; change: number } | null> {
    try {
      // Simulated stock data
      const stocks: Record<string, { price: number; change: number }> = {
        'AAPL': { price: 175.50, change: 2.5 },
        'GOOGL': { price: 2750.80, change: -15.2 },
        'MSFT': { price: 335.25, change: 5.8 },
        'TSLA': { price: 245.60, change: -8.4 }
      };

      return stocks[symbol.toUpperCase()] ? {
        symbol: symbol.toUpperCase(),
        ...stocks[symbol.toUpperCase()]
      } : null;
    } catch (error) {
      console.error('Error getting stock price:', error);
      return null;
    }
  }

  // Translation Service (simulated)
  async translateText(text: string, targetLanguage: string): Promise<string | null> {
    try {
      // For demo purposes, we'll simulate basic translations
      // In a real implementation, you would use Google Translate API or similar

      const translations: Record<string, Record<string, string>> = {
        'hello': {
          'spanish': 'hola',
          'french': 'bonjour',
          'german': 'hallo',
          'italian': 'ciao'
        },
        'thank you': {
          'spanish': 'gracias',
          'french': 'merci',
          'german': 'danke',
          'italian': 'grazie'
        },
        'goodbye': {
          'spanish': 'adiós',
          'french': 'au revoir',
          'german': 'tschüss',
          'italian': 'arrivederci'
        }
      };

      const normalizedText = text.toLowerCase().trim();
      return translations[normalizedText]?.[targetLanguage.toLowerCase()] || null;
    } catch (error) {
      console.error('Error translating text:', error);
      return null;
    }
  }

  // Reminder Integration
  async scheduleReminder(title: string, time: string, description?: string): Promise<boolean> {
    try {
      // In a real implementation, this would integrate with calendar APIs
      console.log(`Scheduling reminder: ${title} at ${time}`);

      // Simulate successful scheduling
      return true;
    } catch (error) {
      console.error('Error scheduling reminder:', error);
      return false;
    }
  }

  // Email Integration (simulated)
  async sendEmail(to: string, subject: string, body: string): Promise<boolean> {
    try {
      // In a real implementation, this would use email APIs
      console.log(`Sending email to ${to}: ${subject}`);

      // Simulate successful email sending
      return true;
    } catch (error) {
      console.error('Error sending email:', error);
      return false;
    }
  }
}

export const externalIntegrations = ExternalIntegrations.getInstance();
