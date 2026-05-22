# Auto - Facebook Group Posting Extension

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![Chrome Web Store](https://img.shields.io/badge/chrome%20web%20store-supported-brightgreen)
![License](https://img.shields.io/badge/license-MIT-green)

Auto is a Chrome extension that automates Facebook group posting. This is a clean, reverse-engineered build with full source code transparency.

## Features

✨ **Automated Posting**
- Post text and images to multiple Facebook groups simultaneously
- Campaign-based scheduling
- Real-time campaign status monitoring

🔐 **Secure**
- OAuth-based Facebook authentication
- Local storage of credentials
- Network request interception for enhanced security

📊 **Developer-Friendly**
- Background logs accessible via UI
- Native message logging support
- Export logs in JSON format
- Built with Manifest V3

## Installation

### Quick Start

1. Open **`chrome://extensions`** in your Chrome browser
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the extension folder: `chrome_extension_auto_re`
5. The extension is now installed!

### Requirements

- Chrome/Chromium browser
- Must be logged into Facebook in Chrome
- Windows (native logging setup)

## Usage

### Creating a Campaign

1. Click the **Auto** extension icon in your toolbar
2. The popup will load the main interface
3. Select Facebook groups where you want to post
4. Enter your post content (text + images)
5. Choose posting schedule or post immediately
6. Click **Start Campaign**

### Monitoring Campaigns

- View active campaigns in real-time
- Monitor posting progress for each group
- See failed groups and error details
- Track campaign history

### Exporting Logs

1. Open the **Error Monitor** tab
2. Click **Export Dev Logs**
3. Download logs containing:
   - Background service worker logs
   - Current campaign snapshot
   - Campaign history
   - Failed groups report
   - Error logs

## Development

### File Structure

```
chrome_extension_auto_re/
├── manifest.json              # Chrome extension manifest
├── background.js              # Service worker (core logic)
├── networkrule.json           # Network request rules
├── icons/                      # Extension icons
├── ui/
│   ├── popup.html            # Main UI interface
│   ├── popup.css             # UI styling
│   └── popup.js              # UI logic
├── dev_logger/               # Development logging tools
│   ├── install_windows.ps1   # Windows native host setup
│   ├── native_host.cmd       # Native host runner
│   ├── native_host.py        # Python logging server
│   └── com.auto_re.logger.json
├── _metadata/                # Chrome extension metadata
└── response.json             # Sample API responses
```

### Key Components

- **background.js**: Main service worker handling campaigns, API calls, and messaging
- **popup.html/js/css**: User interface for creating and managing campaigns
- **networkrule.json**: Declarative Net Request rules for network interception
- **dev_logger/**: Optional native messaging setup for enhanced logging

### Architecture

The extension uses:
- **Manifest V3** (latest Chrome extension standard)
- **Service Workers** instead of background pages
- **Storage API** for persistent data
- **Native Messaging** for system integration (optional)
- **Alarms API** for scheduled campaign execution

## Developer Logging (Optional)

### Windows Native Logger Setup

For enhanced local logging:

1. Find your extension ID in `chrome://extensions`
2. Run the setup script:
   ```powershell
   powershell -ExecutionPolicy Bypass -File dev_logger/install_windows.ps1 -ExtensionId YOUR_EXTENSION_ID
   ```
3. Reload the extension in `chrome://extensions`
4. Logs will be saved to: `%LOCALAPPDATA%\AutoRe\dev_logger\events.ndjson`

### UI-Based Log Export

1. Open the extension popup
2. Go to **Error Monitor** tab
3. Click **Export Dev Logs**
4. JSON file downloads with all logs and campaign data

## Configuration

### Storage Keys

The extension stores data with these keys:
- `auto_re_campaigns_by_account`: Saved campaigns per account
- `auto_re_running_campaign`: Currently active campaign
- `auto_re_bg_logs`: Background service logs
- `auto_re_failed_groups_by_account`: Failed posting attempts
- `auto_re_error_logs_by_account`: Detailed error logs

### Network Permissions

The extension requires access to:
- `https://www.facebook.com/*`
- `https://facebook.com/*`
- `https://*.facebook.com/*`
- `https://upload.facebook.com/*`
- `https://vupload-edge.facebook.com/*`

## Troubleshooting

### Extension won't load
- Ensure Developer mode is enabled
- Check file paths are correct
- Verify manifest.json is valid JSON

### Can't see Facebook groups
- Confirm you're logged into Facebook in Chrome
- Check browser console for errors (F12 → Console)
- Clear extension storage and reload

### Posting fails to some groups
- Check group permissions (some are private)
- Verify you're a member with posting rights
- See Error Monitor for detailed failure reasons

### Native logging not working
- Ensure Windows PowerShell 5.1+ is installed
- Run setup script with correct extension ID
- Check `%LOCALAPPDATA%\AutoRe\dev_logger\` folder exists

## Security Considerations

⚠️ **Important**: 
- This extension has access to your Facebook account data
- Only use on trusted machines
- Review the source code before installing
- Be aware of Facebook's Terms of Service regarding automation

## API Response Examples

Sample GraphQL responses are included in:
- `response.json` - Example Facebook API responses for reference

## Contributing

We welcome contributions! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Version History

### v1.0.0 (Initial Release)
- Automated Facebook group posting
- Multi-group campaign support
- Real-time campaign monitoring
- Developer logging with native messaging
- Error tracking and export
- Manifest V3 compliance

## Support

For issues, questions, or suggestions:
- Open an [Issue](https://github.com/your-username/auto-extension/issues)
- Check existing discussions
- Review the [Troubleshooting](#troubleshooting) section

## Disclaimer

This tool is for personal use only. Users are responsible for:
- Complying with Facebook's Terms of Service
- Respecting group policies and user privacy
- Obtaining necessary permissions
- Any consequences of automated posting

**Use responsibly and ethically.**

---

**Made with ❤️ | Version 1.0.0**
