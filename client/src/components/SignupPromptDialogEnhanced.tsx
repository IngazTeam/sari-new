import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, Gift, Clock } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useLocation } from 'wouter';

interface SignupPromptDialogEnhancedProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  messageCount: number;
}

export function SignupPromptDialogEnhanced({
  isOpen,
  onClose,
  sessionId,
  messageCount,
}: SignupPromptDialogEnhancedProps) {
  const [, setLocation] = useLocation();
  const [variant, setVariant] = useState<any>(null);
  const [offer, setOffer] = useState<any>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [testResultId, setTestResultId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Get random variant
  const getVariantQuery = trpc.signupPrompt.getRandomVariant.useQuery(undefined, {
    enabled: isOpen,
  });
  
  // Get active offers
  const getOffersQuery = trpc.offers.getActive.useQuery(undefined, {
    enabled: isOpen,
  });
  
  // Record test result
  const recordResultMutation = trpc.signupPrompt.recordResult.useMutation();
  
  // Update test result
  const updateResultMutation = trpc.signupPrompt.updateResult.useMutation();

  // Initialize variant and offer
  useEffect(() => {
    if (isOpen && getVariantQuery.data && !isLoading) {
      const selectedVariant = getVariantQuery.data;
      setVariant(selectedVariant);

      // Get offer if variant shows offer
      if (selectedVariant.showOffer && getOffersQuery.data && getOffersQuery.data.length > 0) {
        const randomOffer = getOffersQuery.data[Math.floor(Math.random() * getOffersQuery.data.length)];
        setOffer(randomOffer);
        setTimeLeft(randomOffer.durationMinutes * 60); // Convert to seconds
      }

      // Record that variant was shown
      recordResultMutation.mutate(
        {
          sessionId,
          variantId: selectedVariant.variantId,
          shown: true,
        },
        {
          onSuccess: (result: any) => {
            setTestResultId(result?.id || null);
          },
        }
      );
    }
  }, [isOpen, getVariantQuery.data, getOffersQuery.data, isLoading]);

  // Set loading to false when data is ready
  useEffect(() => {
    if (getVariantQuery.data && getOffersQuery.data !== undefined) {
      setIsLoading(false);
    }
  }, [getVariantQuery.data, getOffersQuery.data]);

  // Countdown timer for offer
  useEffect(() => {
    if (timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  const handleCTAClick = () => {
    // Update test result - clicked
    if (testResultId) {
      updateResultMutation.mutate({
        id: testResultId,
        clicked: true,
        converted: true,
      });
    }
    
    // Navigate to signup
    setLocation('/signup');
    onClose();
  };

  const handleClose = () => {
    // Update test result - dismissed
    if (testResultId) {
      updateResultMutation.mutate({
        id: testResultId,
        dismissedAt: new Date(),
      });
    }
    onClose();
  };

  const formatTimeLeft = () => {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  if (!variant) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-2xl font-bold text-green-900">
              {variant.title}
            </DialogTitle>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <DialogDescription className="text-gray-700 mt-2">
            {variant.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Offer Section */}
          {offer && (
            <div className="bg-white rounded-lg border-2 border-yellow-300 p-4 shadow-md">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1">
                  <Gift className="w-6 h-6 text-yellow-500 flex-shrink-0 mt-1" />
                  <div className="flex-1">
                    <h3 className="font-bold text-lg text-yellow-700">
                      {offer.title}
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                      {offer.description}
                    </p>
                    {offer.discountPercentage && (
                      <p className="text-2xl font-bold text-yellow-600 mt-2">
                        خصم {offer.discountPercentage}%
                      </p>
                    )}
                    {offer.discountAmount && (
                      <p className="text-2xl font-bold text-yellow-600 mt-2">
                        توفير {offer.discountAmount} ريال
                      </p>
                    )}
                  </div>
                </div>

                {/* Countdown Timer */}
                {timeLeft > 0 && (
                  <div className="flex items-center gap-2 bg-red-50 px-3 py-2 rounded-lg flex-shrink-0">
                    <Clock className="w-5 h-5 text-red-500" />
                    <span className="font-bold text-red-600 text-sm">
                      {formatTimeLeft()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Offer Text */}
          {variant.offerText && (
            <div className="bg-green-100 border-l-4 border-green-500 p-3 rounded">
              <p className="text-green-800 font-medium">{variant.offerText}</p>
            </div>
          )}

          {/* CTA Button */}
          <Button
            onClick={handleCTAClick}
            className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold py-3 rounded-lg transition-all transform hover:scale-105 active:scale-95"
          >
            {variant.ctaText}
          </Button>

          {/* Close Button */}
          <Button
            onClick={handleClose}
            variant="outline"
            className="w-full border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            ليس الآن
          </Button>
        </div>

        {/* Footer Note */}
        <div className="text-xs text-gray-500 text-center pt-2 border-t border-gray-200">
          عرض محدود الوقت - لا تفوت هذه الفرصة!
        </div>
      </DialogContent>
    </Dialog>
  );
}
