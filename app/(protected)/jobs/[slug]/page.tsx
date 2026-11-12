import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import {
  getPublishedNotificationBySlug,
  listJobPostsForNotification,
  getJobSourceById,
} from "@/db/jobs";
import { isJobSaved } from "@/db/saved-jobs";
import { evaluateJobForUser } from "@/services/eligibility/evaluate";
import { EligibilityBadge } from "@/components/jobs/eligibility-badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SaveButton } from "../save-button";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: `${slug.replace(/-/g, " ")} · Job details` };
}

export default async function JobDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { supabase, user } = await requireUser(`/jobs/${slug}`);

  const notification = await getPublishedNotificationBySlug(supabase, slug);
  if (!notification) notFound();

  const [posts, source] = await Promise.all([
    listJobPostsForNotification(supabase, notification.id),
    getJobSourceById(supabase, notification.source_id),
  ]);

  const postsWithEligibility = await Promise.all(
    posts.map(async (post) => ({
      post,
      result: await evaluateJobForUser(supabase, user.id, post.id),
      saved: await isJobSaved(supabase, user.id, post.id),
    })),
  );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <Link
          href="/dashboard"
          className="mb-3 inline-block text-sm font-medium text-brand-600 hover:text-brand-700 hover:underline"
        >
          ← Back to dashboard
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          {notification.title}
        </h1>
        <p className="mt-1 text-sm text-gray-500">{notification.organizations.name}</p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
          <span>Notified {notification.notification_date}</span>
          {notification.application_start_date ? (
            <span>Applications open {notification.application_start_date}</span>
          ) : null}
          {notification.application_end_date ? (
            <span>Applications close {notification.application_end_date}</span>
          ) : null}
        </div>
        {notification.description ? (
          <p className="mt-4 text-sm leading-relaxed text-gray-700">{notification.description}</p>
        ) : null}
      </div>

      {/* PRD.md §12: two clearly distinct, separately labeled actions — the
          application link is only ever shown when actually known, never
          fabricated. */}
      <div className="flex gap-3">
        <a href={notification.official_advertisement_url} target="_blank" rel="noopener noreferrer">
          <Button variant="secondary" fullWidth={false} className="px-5">
            View Official Advertisement
          </Button>
        </a>
        {notification.official_application_url ? (
          <a href={notification.official_application_url} target="_blank" rel="noopener noreferrer">
            <Button fullWidth={false} className="px-5">
              Apply on Official Website
            </Button>
          </a>
        ) : null}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Posts</h2>
        <ul className="flex flex-col gap-4">
          {postsWithEligibility.map(({ post, result, saved }) => (
            <li key={post.id}>
              <Card>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-gray-900">{post.title}</p>
                    {post.vacancy_count !== null ? (
                      <p className="text-xs text-gray-500">{post.vacancy_count} vacancies</p>
                    ) : null}
                    {post.pay_scale_min !== null || post.pay_scale_max !== null ? (
                      <p className="text-xs text-gray-500">
                        Pay scale: {post.pay_scale_min ?? "?"}–{post.pay_scale_max ?? "?"}
                        {post.pay_scale_note ? ` (${post.pay_scale_note})` : ""}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <EligibilityBadge status={result.status} />
                    <SaveButton jobPostId={post.id} initiallySaved={saved} />
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4">
                  {result.dimensions.map((d) => (
                    <div key={d.dimension} className="text-sm">
                      <p className="font-medium capitalize text-gray-800">
                        {d.dimension.replace("_", " / ")}
                      </p>
                      <ul className="ml-4 list-disc text-xs text-gray-600">
                        {d.reasons.map((reason, i) => (
                          <li key={i}>
                            {d.outcome === "pass" ? "✓ " : d.outcome === "fail" ? "✗ " : "? "}
                            {reason}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </div>

      {source ? (
        <div className="text-xs text-gray-500">
          Source: {source.name} ({source.official_domain}).{" "}
          {source.last_checked_at
            ? `Last checked ${new Date(source.last_checked_at).toLocaleDateString()}.`
            : null}
        </div>
      ) : null}
    </div>
  );
}
