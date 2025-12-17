import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle, Save, RotateCcw } from "lucide-react";

interface GlobalSeoSettings {
  siteName: string;
  siteDescription: string;
  siteUrl: string;
  siteKeywords: string;
  siteAuthor: string;
  siteImage: string;
  googleAnalyticsId: string;
  googleTagManagerId: string;
  facebookPixelId: string;
  twitterHandle: string;
  linkedinUrl: string;
  instagramHandle: string;
  contactEmail: string;
  contactPhone: string;
  businessAddress: string;
  businessCity: string;
  businessCountry: string;
  businessZipCode: string;
  robotsTxt: string;
  sitemapUrl: string;
  canonicalUrl: string;
  preferredLanguage: string;
  alternateLanguages: string;
}

const defaultSettings: GlobalSeoSettings = {
  siteName: "Sari - AI Sales Agent",
  siteDescription: "AI-powered WhatsApp sales agent for businesses",
  siteUrl: "https://sari.app",
  siteKeywords: "AI, WhatsApp, Sales, Chatbot, Business",
  siteAuthor: "Sari Team",
  siteImage: "https://sari.app/og-image.png",
  googleAnalyticsId: "",
  googleTagManagerId: "",
  facebookPixelId: "",
  twitterHandle: "@sariapp",
  linkedinUrl: "https://linkedin.com/company/sari",
  instagramHandle: "@sariapp",
  contactEmail: "support@sari.app",
  contactPhone: "+966501234567",
  businessAddress: "123 Business Street",
  businessCity: "Riyadh",
  businessCountry: "Saudi Arabia",
  businessZipCode: "12345",
  robotsTxt: `User-agent: *
Allow: /
Disallow: /admin
Disallow: /api
Sitemap: https://sari.app/sitemap.xml`,
  sitemapUrl: "https://sari.app/sitemap.xml",
  canonicalUrl: "https://sari.app",
  preferredLanguage: "en",
  alternateLanguages: "ar,fr",
};

export default function GlobalSeoSettings() {
  const [settings, setSettings] = useState<GlobalSeoSettings>(defaultSettings);
  const [saved, setSaved] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const handleChange = (field: keyof GlobalSeoSettings, value: string) => {
    setSettings((prev) => ({
      ...prev,
      [field]: value,
    }));
    setIsDirty(true);
    setSaved(false);
  };

  const handleSave = () => {
    // Save to localStorage for demo
    localStorage.setItem("globalSeoSettings", JSON.stringify(settings));
    setSaved(true);
    setIsDirty(false);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleReset = () => {
    setSettings(defaultSettings);
    setIsDirty(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Global SEO Settings</h1>
          <p className="text-muted-foreground mt-2">
            Configure site-wide SEO settings and metadata
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={!isDirty}
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset
          </Button>
          <Button
            onClick={handleSave}
            disabled={!isDirty}
          >
            <Save className="w-4 h-4 mr-2" />
            Save Changes
          </Button>
        </div>
      </div>

      {saved && (
        <Alert className="bg-green-50 border-green-200">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            Settings saved successfully!
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="social">Social</TabsTrigger>
          <TabsTrigger value="tracking">Tracking</TabsTrigger>
          <TabsTrigger value="business">Business</TabsTrigger>
          <TabsTrigger value="technical">Technical</TabsTrigger>
        </TabsList>

        {/* General Tab */}
        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Site Information</CardTitle>
              <CardDescription>
                Basic information about your website
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="siteName">Site Name</Label>
                  <Input
                    id="siteName"
                    value={settings.siteName}
                    onChange={(e) => handleChange("siteName", e.target.value)}
                    placeholder="Your site name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="siteUrl">Site URL</Label>
                  <Input
                    id="siteUrl"
                    value={settings.siteUrl}
                    onChange={(e) => handleChange("siteUrl", e.target.value)}
                    placeholder="https://example.com"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="siteDescription">Site Description</Label>
                <Textarea
                  id="siteDescription"
                  value={settings.siteDescription}
                  onChange={(e) => handleChange("siteDescription", e.target.value)}
                  placeholder="Brief description of your site (160 characters recommended)"
                  rows={3}
                />
                <p className="text-sm text-muted-foreground">
                  {settings.siteDescription.length}/160 characters
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="siteKeywords">Keywords</Label>
                <Textarea
                  id="siteKeywords"
                  value={settings.siteKeywords}
                  onChange={(e) => handleChange("siteKeywords", e.target.value)}
                  placeholder="Comma-separated keywords"
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="siteAuthor">Site Author</Label>
                  <Input
                    id="siteAuthor"
                    value={settings.siteAuthor}
                    onChange={(e) => handleChange("siteAuthor", e.target.value)}
                    placeholder="Author name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="preferredLanguage">Preferred Language</Label>
                  <Input
                    id="preferredLanguage"
                    value={settings.preferredLanguage}
                    onChange={(e) => handleChange("preferredLanguage", e.target.value)}
                    placeholder="en"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="siteImage">OG Image URL</Label>
                <Input
                  id="siteImage"
                  value={settings.siteImage}
                  onChange={(e) => handleChange("siteImage", e.target.value)}
                  placeholder="https://example.com/og-image.png"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Social Tab */}
        <TabsContent value="social" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Social Media</CardTitle>
              <CardDescription>
                Social media profiles and handles
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="twitterHandle">Twitter Handle</Label>
                  <Input
                    id="twitterHandle"
                    value={settings.twitterHandle}
                    onChange={(e) => handleChange("twitterHandle", e.target.value)}
                    placeholder="@yourhandle"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="instagramHandle">Instagram Handle</Label>
                  <Input
                    id="instagramHandle"
                    value={settings.instagramHandle}
                    onChange={(e) => handleChange("instagramHandle", e.target.value)}
                    placeholder="@yourhandle"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="linkedinUrl">LinkedIn URL</Label>
                <Input
                  id="linkedinUrl"
                  value={settings.linkedinUrl}
                  onChange={(e) => handleChange("linkedinUrl", e.target.value)}
                  placeholder="https://linkedin.com/company/yourcompany"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tracking Tab */}
        <TabsContent value="tracking" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Analytics & Tracking</CardTitle>
              <CardDescription>
                Configure tracking codes and analytics
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="googleAnalyticsId">Google Analytics ID</Label>
                <Input
                  id="googleAnalyticsId"
                  value={settings.googleAnalyticsId}
                  onChange={(e) => handleChange("googleAnalyticsId", e.target.value)}
                  placeholder="G-XXXXXXXXXX"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="googleTagManagerId">Google Tag Manager ID</Label>
                <Input
                  id="googleTagManagerId"
                  value={settings.googleTagManagerId}
                  onChange={(e) => handleChange("googleTagManagerId", e.target.value)}
                  placeholder="GTM-XXXXXX"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="facebookPixelId">Facebook Pixel ID</Label>
                <Input
                  id="facebookPixelId"
                  value={settings.facebookPixelId}
                  onChange={(e) => handleChange("facebookPixelId", e.target.value)}
                  placeholder="123456789"
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Business Tab */}
        <TabsContent value="business" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Business Information</CardTitle>
              <CardDescription>
                Business contact and location details
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contactEmail">Contact Email</Label>
                  <Input
                    id="contactEmail"
                    type="email"
                    value={settings.contactEmail}
                    onChange={(e) => handleChange("contactEmail", e.target.value)}
                    placeholder="contact@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactPhone">Contact Phone</Label>
                  <Input
                    id="contactPhone"
                    value={settings.contactPhone}
                    onChange={(e) => handleChange("contactPhone", e.target.value)}
                    placeholder="+1234567890"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="businessAddress">Address</Label>
                <Input
                  id="businessAddress"
                  value={settings.businessAddress}
                  onChange={(e) => handleChange("businessAddress", e.target.value)}
                  placeholder="Street address"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="businessCity">City</Label>
                  <Input
                    id="businessCity"
                    value={settings.businessCity}
                    onChange={(e) => handleChange("businessCity", e.target.value)}
                    placeholder="City"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="businessCountry">Country</Label>
                  <Input
                    id="businessCountry"
                    value={settings.businessCountry}
                    onChange={(e) => handleChange("businessCountry", e.target.value)}
                    placeholder="Country"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="businessZipCode">Zip Code</Label>
                  <Input
                    id="businessZipCode"
                    value={settings.businessZipCode}
                    onChange={(e) => handleChange("businessZipCode", e.target.value)}
                    placeholder="12345"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Technical Tab */}
        <TabsContent value="technical" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Technical SEO</CardTitle>
              <CardDescription>
                Technical SEO configuration
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="canonicalUrl">Canonical URL</Label>
                <Input
                  id="canonicalUrl"
                  value={settings.canonicalUrl}
                  onChange={(e) => handleChange("canonicalUrl", e.target.value)}
                  placeholder="https://example.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sitemapUrl">Sitemap URL</Label>
                <Input
                  id="sitemapUrl"
                  value={settings.sitemapUrl}
                  onChange={(e) => handleChange("sitemapUrl", e.target.value)}
                  placeholder="https://example.com/sitemap.xml"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="robotsTxt">Robots.txt</Label>
                <Textarea
                  id="robotsTxt"
                  value={settings.robotsTxt}
                  onChange={(e) => handleChange("robotsTxt", e.target.value)}
                  placeholder="User-agent: *&#10;Allow: /"
                  rows={6}
                  className="font-mono text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="alternateLanguages">Alternate Languages</Label>
                <Input
                  id="alternateLanguages"
                  value={settings.alternateLanguages}
                  onChange={(e) => handleChange("alternateLanguages", e.target.value)}
                  placeholder="ar,fr,es"
                />
                <p className="text-sm text-muted-foreground">
                  Comma-separated language codes
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Status Summary */}
      <Card>
        <CardHeader>
          <CardTitle>SEO Status Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Site Name</p>
              <Badge variant={settings.siteName ? "default" : "secondary"}>
                {settings.siteName ? "✓ Set" : "⚠ Missing"}
              </Badge>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Description</p>
              <Badge variant={settings.siteDescription ? "default" : "secondary"}>
                {settings.siteDescription ? "✓ Set" : "⚠ Missing"}
              </Badge>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Analytics</p>
              <Badge variant={settings.googleAnalyticsId ? "default" : "secondary"}>
                {settings.googleAnalyticsId ? "✓ Set" : "⚠ Missing"}
              </Badge>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Sitemap</p>
              <Badge variant={settings.sitemapUrl ? "default" : "secondary"}>
                {settings.sitemapUrl ? "✓ Set" : "⚠ Missing"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
