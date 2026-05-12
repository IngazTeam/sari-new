import { useState } from "react";
import { useTranslation } from "react-i18next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

import { Mail, Phone, MapPin, Clock, Send, MessageCircle } from "lucide-react";

export default function Contact() {
  const { t } = useTranslation();

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    subject: "",
    message: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Simulate form submission
    await new Promise(resolve => setTimeout(resolve, 1500));

    alert("تم إرسال رسالتك بنجاح! سنتواصل معك في أقرب وقت ممكن.");

    setFormData({
      name: "",
      email: "",
      phone: "",
      subject: "",
      message: ""
    });
    setIsSubmitting(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const contactInfo = [
    {
      icon: Mail,
      title: "البريد الإلكتروني",
      value: "support@sari.sa",
      description: "راسلنا في أي وقت"
    },
    {
      icon: Phone,
      title: "الهاتف",
      value: "+966 50 123 4567",
      description: "من السبت إلى الخميس"
    },
    {
      icon: MapPin,
      title: "العنوان",
      value: "الرياض، المملكة العربية السعودية",
      description: "مركز الأعمال الرئيسي"
    },
    {
      icon: Clock,
      title: "ساعات العمل",
      value: "9 صباحاً - 6 مساءً",
      description: "من السبت إلى الخميس"
    }
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background" dir="rtl">
      <SeoHead {...useSeoConfig('contact')} />
      <Navbar />
      
      <main className="flex-1">
        {/* Hero Section */}
        <section className="bg-gradient-to-b from-primary/10 to-background py-20">
          <div className="container mx-auto px-4">
            <div className="max-w-3xl mx-auto text-center">
              <MessageCircle className="h-16 w-16 text-primary mx-auto mb-6" />
              <h1 className="text-4xl md:text-5xl font-bold mb-6">{t('contact.auto_0')}<span className="text-primary">{t('contact.auto_1')}</span>
              </h1>
              <p className="text-xl text-muted-foreground">{t('contact.auto_2')}</p>
            </div>
          </div>
        </section>

        {/* Contact Info Cards */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
              {contactInfo.map((info, index) => (
                <Card key={index} className="text-center hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="mx-auto mb-4 p-3 bg-primary/10 rounded-full w-fit">
                      <info.icon className="h-6 w-6 text-primary" />
                    </div>
                    <CardTitle className="text-lg">{info.title}</CardTitle>
                    <CardDescription>{info.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="font-semibold">{info.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Contact Form */}
        <section className="py-16 bg-accent/30">
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Form */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-2xl">{t('contact.auto_3')}</CardTitle>
                    <CardDescription>{t('contact.auto_4')}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div>
                        <Label htmlFor="name">{t('contact.auto_5')}</Label>
                        <Input
                          id="name"
                          name="name"
                          value={formData.name}
                          onChange={handleChange}
                          required
                          placeholder={t('contact.auto_22')}
                        />
                      </div>

                      <div>
                        <Label htmlFor="email">{t('contact.auto_6')}</Label>
                        <Input
                          id="email"
                          name="email"
                          type="email"
                          value={formData.email}
                          onChange={handleChange}
                          required
                          placeholder="example@email.com"
                        />
                      </div>

                      <div>
                        <Label htmlFor="phone">{t('contact.auto_7')}</Label>
                        <Input
                          id="phone"
                          name="phone"
                          type="tel"
                          value={formData.phone}
                          onChange={handleChange}
                          placeholder="+966 5X XXX XXXX"
                        />
                      </div>

                      <div>
                        <Label htmlFor="subject">{t('contact.auto_8')}</Label>
                        <Input
                          id="subject"
                          name="subject"
                          value={formData.subject}
                          onChange={handleChange}
                          required
                          placeholder={t('contact.auto_23')}
                        />
                      </div>

                      <div>
                        <Label htmlFor="message">{t('contact.auto_9')}</Label>
                        <Textarea
                          id="message"
                          name="message"
                          value={formData.message}
                          onChange={handleChange}
                          required
                          placeholder={t('contact.auto_24')}
                          rows={5}
                        />
                      </div>

                      <Button
                        type="submit"
                        className="w-full bg-primary hover:bg-primary/90"
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? (
                          "جاري الإرسال..."
                        ) : (
                          <>
                            <Send className="ml-2 h-4 w-4" />{t('contact.auto_10')}</>
                        )}
                      </Button>
                    </form>
                  </CardContent>
                </Card>

                {/* Additional Info */}
                <div className="space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>{t('contact.auto_11')}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-muted-foreground">{t('contact.auto_12')}</p>
                      <Button variant="outline" className="w-full">
                        <MessageCircle className="ml-2 h-4 w-4" />{t('contact.auto_13')}</Button>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>{t('contact.auto_14')}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-muted-foreground">{t('contact.auto_15')}</p>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                          <Mail className="h-4 w-4 text-primary" />
                          <span>sales@sari.sa</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Phone className="h-4 w-4 text-primary" />
                          <span>+966 50 123 4567</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>{t('contact.auto_16')}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-muted-foreground">{t('contact.auto_17')}</p>
                      <Button variant="outline" className="w-full">{t('contact.auto_18')}</Button>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Map Section (Placeholder) */}
        <section className="py-16">
          <div className="container mx-auto px-4">
            <div className="max-w-6xl mx-auto">
              <h2 className="text-3xl font-bold text-center mb-8">{t('contact.auto_19')}</h2>
              <div className="bg-accent/30 rounded-lg h-96 flex items-center justify-center">
                <div className="text-center">
                  <MapPin className="h-12 w-12 text-primary mx-auto mb-4" />
                  <p className="text-muted-foreground">{t('contact.auto_20')}</p>
                  <p className="text-sm text-muted-foreground mt-2">{t('contact.auto_21')}</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
