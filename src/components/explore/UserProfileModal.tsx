import React, { useState } from 'react';
import { PublicUser, Collection } from '../../types';
import { Modal } from '../common/Modal';
import { ExternalLink, Layers, Check, UserPlus, UserCheck } from 'lucide-react';

interface UserProfileModalProps {
  user: PublicUser | null;
  isOpen: boolean;
  onClose: () => void;
  collections: Collection[];
  onSelectCollection: (col: Collection) => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  user,
  isOpen,
  onClose,
  collections,
  onSelectCollection,
}) => {
  const [isFollowing, setIsFollowing] = useState(user?.following || false);

  if (!user) return null;

  const userCollections = collections.filter(c =>
    user.createdCollectionIds.includes(c.id)
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="lg" title="创作者主页">
      <div className="space-y-6 pt-1">
        {/* User Card */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <img
              src={user.avatar}
              alt={user.name}
              className="w-14 h-14 rounded-full object-cover border-2 border-white/80 shadow-md"
            />
            <div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                {user.name}
              </h3>
              {user.website && (
                <a
                  href={user.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-sky-500 hover:underline flex items-center gap-1 mt-0.5"
                >
                  <span>{user.website.replace(/^https?:\/\//, '')}</span>
                  <ExternalLink size={11} />
                </a>
              )}
            </div>
          </div>

          <button
            onClick={() => setIsFollowing(prev => !prev)}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium transition-colors ${
              isFollowing
                ? 'bg-slate-200/70 dark:bg-slate-700/60 text-slate-600 dark:text-slate-200'
                : 'bg-sky-500 hover:bg-sky-600 text-white shadow-xs'
            }`}
          >
            {isFollowing ? (
              <>
                <UserCheck size={13} />
                <span>已关注</span>
              </>
            ) : (
              <>
                <UserPlus size={13} />
                <span>关注作者</span>
              </>
            )}
          </button>
        </div>

        {/* Bio */}
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-black/5 dark:bg-white/5 p-3 rounded-2xl">
          {user.bio}
        </p>

        {/* User's Public Collections */}
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            公开网址单 ({userCollections.length})
          </h4>

          <div className="space-y-2.5">
            {userCollections.map(col => (
              <div
                key={col.id}
                onClick={() => {
                  onClose();
                  onSelectCollection(col);
                }}
                className="liquid-glass rounded-2xl p-3.5 border border-white/60 dark:border-white/10 flex items-center justify-between cursor-pointer hover:border-sky-500/30 transition-all group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-xl bg-gradient-to-tr ${col.coverGradient || 'from-sky-500 to-indigo-600'} flex items-center justify-center text-white shrink-0`}
                  >
                    <Layers size={16} />
                  </div>
                  <div className="truncate">
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 block truncate">
                      {col.title}
                    </span>
                    <span className="text-[11px] text-slate-400 truncate block">
                      {col.items.length} 个网址 · {col.description}
                    </span>
                  </div>
                </div>

                <span className="text-xs text-sky-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  查看
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
};
