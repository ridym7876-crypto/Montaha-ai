import React, { useState } from 'react';
import { ShoppingCart, Globe, CreditCard, X, ExternalLink } from 'lucide-react';
import { DomainExtension, DomainListing } from '../types';

interface DomainStoreProps {
  isOpen: boolean;
  onClose: () => void;
  deployingCode?: string | null;
}

const DOMAINS: DomainListing[] = [
  { extension: DomainExtension.COM, priceUSD: 20, priceBDT: 2000 },
  { extension: DomainExtension.BD, priceUSD: 1500, priceBDT: 150000 },
  { extension: DomainExtension.ORG, priceUSD: 1500, priceBDT: 150000 },
  { extension: DomainExtension.NET, priceUSD: 1500, priceBDT: 150000 },
  { extension: DomainExtension.AI, priceUSD: 1500, priceBDT: 150000 },
  { extension: DomainExtension.IO, priceUSD: 1500, priceBDT: 150000 },
];

const PAYMENT_METHODS = [
  { name: 'bKash', color: 'bg-pink-600' },
  { name: 'Nagad', color: 'bg-orange-600' },
  { name: 'Rocket', color: 'bg-purple-600' },
  { name: 'Upay', color: 'bg-blue-500' },
  { name: 'Binance', color: 'bg-yellow-500' },
  { name: 'Card', color: 'bg-gray-600' },
];

const DomainStore: React.FC<DomainStoreProps> = ({ isOpen, onClose, deployingCode }) => {
  const [search, setSearch] = useState('');
  const [selectedDomain, setSelectedDomain] = useState<DomainListing | null>(null);
  const [paymentStep, setPaymentStep] = useState<'search' | 'pay' | 'success'>('search');

  if (!isOpen) return null;

  const handleBuy = (domain: DomainListing) => {
    setSelectedDomain(domain);
    setPaymentStep('pay');
  };

  const handlePayment = () => {
    setPaymentStep('success');
  };

  const handleVisitSite = () => {
      if (!deployingCode) return;
      const blob = new Blob([deployingCode], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-gray-850 w-full max-w-2xl rounded-2xl shadow-2xl border border-gray-700 overflow-hidden">
        <div className="flex justify-between items-center p-6 border-b border-gray-700">
          <h2 className="text-2xl font-bold flex items-center gap-2 text-white">
            <Globe className="text-primary-500" /> 
            {deployingCode ? "Deploy Website" : "Domain Store"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X size={24} />
          </button>
        </div>

        <div className="p-6">
          {paymentStep === 'search' && (
            <>
              {deployingCode && (
                  <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-blue-200 text-sm">
                      Select a domain below to host your website.
                  </div>
              )}
              <div className="flex gap-2 mb-6">
                <input
                  type="text"
                  placeholder="Find your perfect domain (e.g., muntaha-ai)"
                  className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-primary-500 outline-none"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <button className="bg-primary-600 hover:bg-primary-700 text-white px-6 rounded-lg font-semibold">
                  Search
                </button>
              </div>

              <div className="grid gap-3 max-h-96 overflow-y-auto">
                {DOMAINS.map((domain) => (
                  <div key={domain.extension} className="flex items-center justify-between p-4 bg-gray-800 rounded-lg border border-gray-700 hover:border-primary-500 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="bg-primary-500/10 p-2 rounded-lg text-primary-500 font-bold">
                        {domain.extension}
                      </div>
                      <div>
                        <div className="text-white font-medium">
                          {search ? `${search}${domain.extension}` : `your-name${domain.extension}`}
                        </div>
                        <div className="text-gray-400 text-xs">Premium Domain</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <div className="text-white font-bold">${domain.priceUSD}</div>
                        <div className="text-gray-400 text-xs">৳ {domain.priceBDT.toLocaleString()}</div>
                      </div>
                      <button 
                        onClick={() => handleBuy(domain)}
                        className="p-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg"
                      >
                        <ShoppingCart size={20} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {paymentStep === 'pay' && selectedDomain && (
            <div className="space-y-6">
              <div className="text-center">
                <h3 className="text-xl text-white mb-2">Checkout</h3>
                <p className="text-gray-400">
                  Buying <span className="text-primary-500 font-bold">{search || 'example'}{selectedDomain.extension}</span>
                </p>
                <div className="text-3xl font-bold text-white mt-4">৳ {selectedDomain.priceBDT.toLocaleString()}</div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {PAYMENT_METHODS.map((method) => (
                  <button 
                    key={method.name}
                    onClick={handlePayment}
                    className={`${method.color} hover:opacity-90 text-white p-4 rounded-lg font-bold shadow-lg transform hover:scale-105 transition-all`}
                  >
                    {method.name}
                  </button>
                ))}
              </div>
              
              <button onClick={() => setPaymentStep('search')} className="w-full text-gray-400 hover:text-white mt-4">
                Cancel
              </button>
            </div>
          )}

          {paymentStep === 'success' && (
             <div className="text-center py-10">
                <div className="bg-green-500/20 text-green-500 p-4 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4">
                    <CreditCard size={40} />
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">Payment Successful!</h3>
                <p className="text-gray-400 mb-6">
                  {deployingCode 
                    ? <span>Your code has been successfully deployed to <span className="text-primary-500 font-bold">https://{search || 'example'}{selectedDomain?.extension}</span></span>
                    : <span>You are now the owner of <span className="text-primary-500">{search || 'example'}{selectedDomain?.extension}</span>.</span>
                  }
                </p>

                {deployingCode && (
                    <button 
                        onClick={handleVisitSite}
                        className="flex items-center gap-2 mx-auto mb-6 text-primary-400 hover:text-white underline transition-colors"
                    >
                        <ExternalLink size={16} /> Visit Website
                    </button>
                )}

                <button 
                  onClick={() => { setPaymentStep('search'); onClose(); }}
                  className="bg-primary-600 text-white px-8 py-3 rounded-lg font-semibold"
                >
                  Done
                </button>
             </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DomainStore;