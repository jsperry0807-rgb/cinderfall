import { fn } from "@cinderfall/sim";
import { useSync } from "../../stores/sync";

function duration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.max(1, Math.round((seconds % 3600) / 60));
    return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function OfflineModal() {
    const away = useSync((s) => s.away);
    const dismiss = useSync((s) => s.dismissAway);

    if (!away) return null;

    return (
        <div
            className="overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="away-title"
        >
            <div className="modal away">
                <h2 id="away-title">While you were away</h2>
                <p className="away-sub">{duration(away.seconds)} of progress</p>

                <ul className="away-stats">
                    <li>
                        <span>Stages</span>
                        <b>{away.stages}</b>
                    </li>
                    <li>
                        <span>Kills</span>
                        <b>{away.kills}</b>
                    </li>
                    <li>
                        <span>Levels</span>
                        <b>{away.levels}</b>
                    </li>
                    <li>
                        <span>Drops</span>
                        <b>{away.drops}</b>
                    </li>
                    <li>
                        <span>Gold</span>
                        <b>{fn(away.gold)}</b>
                    </li>
                    <li>
                        <span>Shards</span>
                        <b>{away.shards}</b>
                    </li>
                </ul>

                {away.died && (
                    <p className="dn">
                        {(away.deaths ?? 1) > 1
                            ? `You fell ${away.deaths} times and rose again each time.`
                            : "You fell while away and rose again."}{" "}
                        Your shards were collected.
                    </p>
                )}
                {away.skipped > 60 && (
                    <p className="mu">
                        The rest of your absence was beyond the offline cap.
                    </p>
                )}

                <button className="btn" onClick={dismiss}>
                    Continue
                </button>
            </div>
        </div>
    );
}
