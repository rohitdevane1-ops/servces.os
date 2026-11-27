import React, { useState } from 'react';
import { useAdmin } from '../../context/adminContextCore';
import { Star, ShieldCheck, Eye, EyeOff, Flag, RefreshCw } from 'lucide-react';

export const Page33CustomerReviewsManagement: React.FC = () => {
  const { reviews, moderateReview, refreshOperationsData, isDataLoading } = useAdmin();
  const [filterRating, setFilterRating] = useState<'ALL' | '5' | 'FLAGGED'>('ALL');
  const [moderatingId, setModeratingId] = useState<string | null>(null);

  const filteredReviews = reviews.filter((r) => {
    if (filterRating === '5') return r.rating === 5;
    if (filterRating === 'FLAGGED') return Boolean(r.moderationFlagged) || r.isPublic === false;
    return true;
  });

  const avgRating =
    reviews.length > 0
      ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(2)
      : '0.00';

  const handleTogglePublic = async (r: any) => {
    setModeratingId(r.id);
    const nextPublic = !(r.isPublic !== false);
    await moderateReview(r.id, nextPublic, Boolean(r.moderationFlagged));
    setModeratingId(null);
  };

  const handleToggleFlag = async (r: any) => {
    setModeratingId(r.id);
    const nextFlagged = !r.moderationFlagged;
    await moderateReview(r.id, nextFlagged ? false : r.isPublic !== false, nextFlagged);
    setModeratingId(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            Customer Reviews &amp; Reputation Moderation
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Server-persisted verified customer reviews and public visibility moderation
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200/80 px-4 py-2 rounded-2xl">
            <Star className="w-5 h-5 text-amber-500 fill-amber-400" />
            <div>
              <div className="text-sm font-extrabold text-amber-900">{avgRating} / 5.0</div>
              <div className="text-[10px] font-bold text-amber-700">{reviews.length} Verified Reviews</div>
            </div>
          </div>

          <button
            onClick={() => void refreshOperationsData()}
            className="p-2.5 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-slate-700 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isDataLoading ? 'animate-spin text-emerald-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2">
        {[
          { key: 'ALL', label: `All Reviews (${reviews.length})` },
          { key: '5', label: `5-Star (${reviews.filter((r) => r.rating === 5).length})` },
          {
            key: 'FLAGGED',
            label: `Hidden / Flagged (${reviews.filter((r) => r.moderationFlagged || r.isPublic === false).length})`,
          },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilterRating(tab.key as any)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterRating === tab.key
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Reviews Grid */}
      {filteredReviews.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 border border-slate-200/80 text-center space-y-2">
          <Star className="w-8 h-8 text-slate-300 mx-auto" />
          <h3 className="text-sm font-extrabold text-slate-800">No Customer Reviews Found</h3>
          <p className="text-xs text-slate-400">
            Verified customer ratings and feedback submitted after completed bookings appear here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredReviews.map((r) => {
            const isPublic = r.isPublic !== false;
            const isFlagged = Boolean(r.moderationFlagged);
            return (
              <div
                key={r.id}
                className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-sm">
                        {r.customerName.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-extrabold text-slate-900">{r.customerName}</span>
                          {isPublic && !isFlagged && (
                            <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                              <ShieldCheck className="w-3 h-3" /> Public
                            </span>
                          )}
                          {isFlagged && (
                            <span className="text-[10px] font-bold bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded">
                              Flagged
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500">
                          {r.serviceName}
                          {r.providerName ? ` • Pro: ${r.providerName}` : ''} • {r.date}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-0.5 text-amber-500 font-bold text-xs bg-amber-50 px-2.5 py-1 rounded-full">
                      ★ {r.rating}.0
                    </div>
                  </div>

                  <p className="text-xs text-slate-700 leading-relaxed italic">
                    "{r.comment || 'No written comment provided.'}"
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <button
                    disabled={moderatingId === r.id}
                    onClick={() => void handleTogglePublic(r)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                      isPublic
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {isPublic ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    <span>{isPublic ? 'Published Publicly' : 'Hidden from Public'}</span>
                  </button>

                  <button
                    disabled={moderatingId === r.id}
                    onClick={() => void handleToggleFlag(r)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                      isFlagged
                        ? 'bg-rose-600 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-rose-50 hover:text-rose-700'
                    }`}
                  >
                    <Flag className="w-3.5 h-3.5" />
                    <span>{isFlagged ? 'Clear Moderation Flag' : 'Flag for Review'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
