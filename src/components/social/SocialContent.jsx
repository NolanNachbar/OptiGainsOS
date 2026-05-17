import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/useUserQueries";
import {
  useFriends,
  usePendingFriendRequests,
  useSentFriendRequests,
  useSendFriendRequest,
  useRespondToFriendRequest,
  useRemoveFriend,
  useUserSearch,
} from "@/hooks/useSocialQueries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LoadingScreen, LoadingSpinner } from "@/components/ui/loading-spinner";
import { Users, UserPlus, Bell, Check, X, UserMinus, Search, Clock } from "lucide-react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/ui/UserAvatar";

export function SocialContent() {
  const { user } = useAuth();
  const { profile, isLoading: profileLoading } = useProfile();
  const { friends, isLoading: friendsLoading } = useFriends();
  const { pendingRequests, isLoading: pendingLoading } = usePendingFriendRequests();
  const { sentRequests } = useSentFriendRequests();
  const sendRequest = useSendFriendRequest();
  const respondToRequest = useRespondToFriendRequest();
  const removeFriend = useRemoveFriend();

  const [searchInput, setSearchInput] = useState("");
  const { results: searchResults, isLoading: searchLoading, isSearching } = useUserSearch(searchInput);
  const navigate = useNavigate();

  // Build a map of user_id → relationship status for search results
  const friendshipStatusMap = useMemo(() => {
    const map = {};
    friends.forEach(f => {
      const friendId = f.requester_id === user?.id ? f.addressee_id : f.requester_id;
      map[friendId] = { status: 'friends', id: f.id };
    });
    sentRequests.forEach(r => {
      map[r.addressee_id] = { status: 'sent' };
    });
    pendingRequests.forEach(r => {
      map[r.requester_id] = { status: 'received', id: r.id };
    });
    return map;
  }, [friends, sentRequests, pendingRequests, user?.id]);

  if (!user || profileLoading) return <LoadingSpinner />;

  if (!profile?.username) {
    return (
      <Card className="border-none shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary-600" />
            Set Up Your Social Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-slate-600">
            You need to set a username before you can use social features. Update your username in the Settings tab above.
          </p>
        </CardContent>
      </Card>
    );
  }

  const handleSendRequest = async (username) => {
    try {
      await sendRequest.mutateAsync(username);
      toast.success(`Friend request sent to @${username}!`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleRespond = async (requestId, action) => {
    try {
      await respondToRequest.mutateAsync({ requestId, action });
      toast.success(action === 'accepted' ? 'Friend request accepted!' : 'Request declined');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleRemoveFriend = async (friendshipId, friendName) => {
    try {
      await removeFriend.mutateAsync(friendshipId);
      toast.success(`Removed ${friendName || 'friend'}`);
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div>
        <Tabs defaultValue="friends">
          <TabsList className="w-full mb-6">
            <TabsTrigger value="friends" className="flex-1">
              <Users className="w-4 h-4 mr-2" />
              Friends {friends.length > 0 && `(${friends.length})`}
            </TabsTrigger>
            <TabsTrigger value="requests" className="flex-1">
              <Bell className="w-4 h-4 mr-2" />
              Requests {pendingRequests.length > 0 && `(${pendingRequests.length})`}
            </TabsTrigger>
            <TabsTrigger value="add" className="flex-1">
              <UserPlus className="w-4 h-4 mr-2" />
              Add Friend
            </TabsTrigger>
          </TabsList>

          {/* Friends Tab */}
          <TabsContent value="friends">
            {friendsLoading ? (
              <div className="flex justify-center py-12">
                <LoadingSpinner />
              </div>
            ) : friends.length === 0 ? (
              <Card className="border-none shadow-lg">
                <CardContent className="py-12 text-center">
                  <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">No friends yet</h3>
                  <p className="text-slate-500">Add friends by entering their username in the "Add Friend" tab.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {friends.map((friendship) => {
                  const fp = friendship.friendProfile;
                  return (
                    <Card key={friendship.id} className="border border-slate-200 dark:border-slate-700 shadow-md">
                      <CardContent className="py-4 mt-2">
                        <div className="flex items-center justify-between">
                          <Link
                            to={fp?.username ? `/profile/${fp.username}` : '#'}
                            className="flex mt-3 items-center gap-3 hover:opacity-80 transition-opacity"
                            onClick={fp?.username ? undefined : (e) => e.preventDefault()}
                          >
                            <UserAvatar url={fp?.avatar_url} username={fp?.username || fp?.display_name} size="sm" className="w-10 h-10" />
                            <div>
                              <p className="font-medium text-slate-900 dark:text-white">
                                {fp?.display_name ? (
                                  <>{fp.display_name} {fp?.username && <span className="text-sm text-slate-500 font-normal">@{fp.username}</span>}</>
                                ) : fp?.username ? (
                                  <>@{fp.username}</>
                                ) : (
                                  <span className="text-slate-400 italic">No username set</span>
                                )}
                              </p>
                              {fp?.current_streak > 0 && fp?.last_workout_date && (() => {
                                const today = new Date(); today.setHours(0,0,0,0);
                                const lastWorkout = new Date(fp.last_workout_date); lastWorkout.setHours(0,0,0,0);
                                const daysSince = Math.round((today - lastWorkout) / 86400000);
                                return daysSince <= 1;
                              })() && (
                                <p className="text-xs text-slate-500 text-left">{fp.current_streak} day streak 🔥</p>
                              )}
                            </div>
                          </Link>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-slate-400 mt-5 hover:text-danger-600 hover:border-danger-300"
                            onClick={() => handleRemoveFriend(friendship.id, fp?.username)}
                          >
                            <UserMinus className="w-4 h-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Requests Tab */}
          <TabsContent value="requests">
            <div className="space-y-6">
              {/* Incoming */}
              <div>
                <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-3">Incoming Requests</h3>
                {pendingLoading ? (
                  <div className="flex justify-center py-8"><LoadingSpinner /></div>
                ) : pendingRequests.length === 0 ? (
                  <Card className="border border-slate-200 dark:border-slate-700 shadow-md">
                    <CardContent className="py-6 text-center text-slate-500">
                      No pending requests
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {pendingRequests.map((req) => (
                      <Card key={req.id} className="border border-slate-200 dark:border-slate-700 shadow-md">
                        <CardContent className="py-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <UserAvatar url={req.requesterProfile?.avatar_url} username={req.requesterProfile?.username || req.requesterProfile?.display_name} size="sm" className="w-10 h-10" />
                              <p className="font-medium text-slate-900 dark:text-white">
                                {req.requesterProfile?.display_name ? (
                                  <>{req.requesterProfile.display_name} {req.requesterProfile?.username && <span className="text-sm text-slate-500 font-normal">@{req.requesterProfile.username}</span>}</>
                                ) : req.requesterProfile?.username ? (
                                  <>@{req.requesterProfile.username}</>
                                ) : (
                                  <span className="text-slate-400 italic">No username set</span>
                                )}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                className="bg-green-600 hover:bg-green-700 text-white"
                                onClick={() => handleRespond(req.id, 'accepted')}
                                disabled={respondToRequest.isPending}
                              >
                                <Check className="w-4 h-4 mr-1" />
                                Accept
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-slate-500 hover:text-danger-600"
                                onClick={() => handleRespond(req.id, 'declined')}
                                disabled={respondToRequest.isPending}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {/* Sent */}
              {sentRequests.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-3">Sent Requests</h3>
                  <div className="space-y-3">
                    {sentRequests.map((req) => (
                      <Card key={req.id} className="border border-slate-200 dark:border-slate-700 shadow-md">
                        <CardContent className="py-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <UserAvatar url={req.addresseeProfile?.avatar_url} username={req.addresseeProfile?.username || req.addresseeProfile?.display_name} size="sm" className="w-10 h-10" />
                              <div>
                                <p className="font-medium text-slate-900 dark:text-white">
                                  {req.addresseeProfile?.display_name ? (
                                    <>{req.addresseeProfile.display_name} {req.addresseeProfile?.username && <span className="text-sm text-slate-500 font-normal">@{req.addresseeProfile.username}</span>}</>
                                  ) : req.addresseeProfile?.username ? (
                                    <>@{req.addresseeProfile.username}</>
                                  ) : (
                                    <span className="text-slate-400 italic">No username set</span>
                                  )}
                                </p>
                                <p className="text-xs text-slate-400">Pending...</p>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Add Friend Tab */}
          <TabsContent value="add">
            {!profile?.username ? (
              <Card className="border border-slate-200 dark:border-slate-700 shadow-md">
                <CardContent className="py-12 text-center">
                  <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <h3 className="font-semibold text-slate-900 dark:text-white mb-2">Set a username first</h3>
                  <p className="text-slate-500 mb-4">You need a username before you can add friends.</p>
                  <Button onClick={() => navigate('/profile')} className="bg-primary-600">
                    Go to Profile
                  </Button>
                </CardContent>
              </Card>
            ) : (
            <div className="space-y-4">
              {/* Search Input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search by name or username..."
                  className="pl-10"
                />
              </div>

              {/* Search States */}
              {!searchInput.trim() ? (
                <Card className="border border-slate-200 dark:border-slate-700 shadow-md">
                  <CardContent className="py-12 text-center">
                    <Search className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500">Search for friends by name or username</p>
                  </CardContent>
                </Card>
              ) : searchInput.trim().length < 2 ? (
                <Card className="border border-slate-200 dark:border-slate-700 shadow-md">
                  <CardContent className="py-8 text-center text-slate-500">
                    Type at least 2 characters to search
                  </CardContent>
                </Card>
              ) : searchLoading ? (
                <div className="flex justify-center py-12">
                  <LoadingSpinner />
                </div>
              ) : searchResults.length === 0 && isSearching ? (
                <Card className="border border-slate-200 dark:border-slate-700 shadow-md">
                  <CardContent className="py-12 text-center">
                    <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500">No users found</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {searchResults.map((result) => {
                    const relationship = friendshipStatusMap[result.user_id];
                    const isPrivate = result.privacy_level !== 'public';

                    return (
                      <Card key={result.user_id} className="border border-slate-200 dark:border-slate-700 shadow-md hover:shadow-lg transition-shadow">
                        <CardContent className="py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div
                              className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                              onClick={() => navigate(`/profile/${result.username}`)}
                            >
                              <UserAvatar url={result.avatar_url} username={result.username} size="sm" className="w-10 h-10 shrink-0" />
                              <div className="min-w-0">
                                <p className="font-medium text-slate-900 truncate">
                                  {result.display_name || result.username}
                                  {result.display_name && (
                                    <span className="text-sm text-slate-500 font-normal ml-1">@{result.username}</span>
                                  )}
                                </p>
                                {isPrivate ? (
                                  <p className="text-xs text-slate-400">Private account</p>
                                ) : result.bio ? (
                                  <p className="text-xs text-slate-500 truncate">{result.bio}</p>
                                ) : null}
                              </div>
                            </div>

                            {/* Action Button */}
                            <div className="shrink-0">
                              {relationship?.status === 'friends' ? (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2.5 py-1.5 rounded-full">
                                  <Check className="w-3 h-3" />
                                  Friends
                                </span>
                              ) : relationship?.status === 'sent' ? (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1.5 rounded-full">
                                  <Clock className="w-3 h-3" />
                                  Pending
                                </span>
                              ) : relationship?.status === 'received' ? (
                                <Button
                                  size="sm"
                                  className="bg-green-600 hover:bg-green-700 text-white"
                                  onClick={() => handleRespond(relationship.id, 'accepted')}
                                  disabled={respondToRequest.isPending}
                                >
                                  <Check className="w-4 h-4 mr-1" />
                                  Accept
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  className="bg-primary-600 hover:bg-primary-700 text-white"
                                  onClick={() => handleSendRequest(result.username)}
                                  disabled={sendRequest.isPending}
                                >
                                  <UserPlus className="w-4 h-4 mr-1" />
                                  Add
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
            )}
          </TabsContent>
        </Tabs>
    </div>
  );
}
