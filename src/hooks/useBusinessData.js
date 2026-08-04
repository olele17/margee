import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import * as api from '../services/api';

export default function useBusinessData() {
  const { account } = useAuth();
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [ads, setAds] = useState([]);
  const [investments, setInvestments] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    if (!account) return;
    const [p, s, a, i, e] = await Promise.all([
      api.listProducts(account.id),
      api.listSales(account.id),
      api.listAds(account.id),
      api.listInvestments(account.id),
      api.listExpenses(account.id),
    ]);
    setProducts(p); setSales(s); setAds(a); setInvestments(i); setExpenses(e);
    setReady(true);
  }, [account]);

  useEffect(() => { reload(); }, [reload]);

  return { account, products, sales, ads, investments, expenses, ready, reload };
}
