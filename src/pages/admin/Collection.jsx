import CollectionPOS from '../../components/admin/CollectionPOS.jsx'
import { Loading, Notice, PageHeader } from '../../components/UI.jsx'
import { useAdminData } from '../../hooks/useAdminData.js'

export default function Collection() {
  const { data, loading, error, refresh } = useAdminData()

  return (
    <div className="page-content collection-pos-page">
      <PageHeader title="Payment Counter" />
      <Notice type="error">{error}</Notice>
      {loading && !data ? <Loading /> : data && <CollectionPOS data={data} onSaved={refresh} />}
    </div>
  )
}
