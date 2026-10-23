export default function SkeletonStationCard() {
    return (
        <div className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm animate-pulse">
            <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                    <div className="h-5 bg-gray-200 rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-gray-100 rounded w-1/2"></div>
                </div>
                <div className="w-16 h-6 bg-gray-100 rounded-full"></div>
            </div>

            <div className="flex gap-4 mb-4">
                <div className="h-4 bg-gray-100 rounded w-16"></div>
                <div className="h-4 bg-gray-100 rounded w-20"></div>
            </div>

            <div className="h-10 bg-gray-100 rounded-xl w-full"></div>
        </div>
    );
}
